'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import { validatePromoCode } from '@/lib/supabase/promo-codes';
import { placeCartHold, releaseCartHold } from '@/lib/supabase/cart-holds';
import type { Tour, CartItem, UpsellItem, PromoCode, RoomCartItem, RoomCartAddon } from '@/types';
import { useToast } from '@/hooks/use-toast';

/**
 * Cart storage version. Bump when the persisted shape changes in a way that
 * older payloads cannot be safely consumed. On load we drop any item whose
 * `productType` is not one of the currently-supported variants.
 */
const CART_STORAGE_VERSION = 'v2';

/** Best-effort cart hold TTL in minutes; mirrored on the server in `placeCartHold`. */
const CART_HOLD_TTL_MINUTES = 15;

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  const host = window.location.host;
  const key = `${host}-cart-session`;
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const next = generateSessionId();
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return generateSessionId();
  }
}

/**
 * Stable cart-session id that survives reloads and is shared across all
 * cart-aware client modules (`use-cart`, `room-detail-view` quote callers,
 * etc). Lives in localStorage under `${host}-cart-session`.
 */
export function getCartSessionId(): string {
  return getOrCreateSessionId();
}

/**
 * Input shape for `addRoomItem`. Everything required for a room line item
 * except the auto-generated `lineId`.
 */
export type AddRoomItemInput = Omit<RoomCartItem, 'productType' | 'product' | 'lineId'> & {
  /** Optional pre-computed product handle. If omitted, one is derived from
   * `roomTypeId`/`name`. */
  product?: { id: string; name: string };
  /** Optional explicit lineId; when omitted, a uuid is generated. */
  lineId?: string;
};

interface CartContextType {
  cartItems: CartItem[];
  /** Alias for `cartItems` — provides a unified, discriminator-aware selector. */
  items: CartItem[];
  promoCode: PromoCode | null;
  addToCart: (
    product: Tour | UpsellItem,
    productType: 'tour' | 'upsell',
    adults?: number,
    children?: number,
    date?: Date,
    quantity?: number,
    packageId?: string,
    packageName?: string
  ) => void;
  removeFromCart: (productId: string, productType: 'tour' | 'upsell', packageId?: string) => void;
  /** Add a fully-priced room line item to the cart. Returns the new lineId. */
  addRoomItem: (input: AddRoomItemInput) => string;
  /** Patch a room line item by `lineId`. */
  updateRoomItem: (
    lineId: string,
    patch: Partial<Omit<RoomCartItem, 'productType' | 'lineId'>>
  ) => void;
  /** Remove a room line item by `lineId`. */
  removeRoomItem: (lineId: string) => void;
  /** Re-place the best-effort cart hold for a given room line; updates
   * `holdExpiresAt` on the line on success. */
  refreshRoomHold: (lineId: string) => Promise<void>;
  /** Stable per-browser cart session id (also used by quote callers as
   * `excludeSessionId`). */
  cartSessionId: string;
  clearCart: () => void;
  getCartTotal: () => number;
  /** Discriminator-aware subtotal across tour, upsell and room items. */
  subtotal: () => number;
  applyPromoCode: (code: string) => Promise<void>;
  removePromoCode: () => void;
  getDiscountAmount: () => number;
  getFinalTotal: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const SUPPORTED_PRODUCT_TYPES: ReadonlySet<CartItem['productType']> = new Set([
  'tour',
  'upsell',
  'room',
]);

function isSupportedCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const pt = (value as { productType?: unknown }).productType;
  return typeof pt === 'string' && SUPPORTED_PRODUCT_TYPES.has(pt as CartItem['productType']);
}

function generateLineId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `room_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function computeRoomAddonsTotal(addons: RoomCartAddon[] | undefined): number {
  if (!addons || addons.length === 0) return 0;
  return addons.reduce((acc, a) => acc + a.unitPrice * a.quantity, 0);
}

function computeRoomLineSubtotal(item: RoomCartItem): number {
  const stayCost = item.pricePerNightAvg * item.nights * item.unitsBooked;
  return stayCost + computeRoomAddonsTotal(item.addons);
}

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [promoCode, setPromoCode] = useState<PromoCode | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const host = typeof window === 'undefined' ? 'app' : window.location.host;
    const CART_STORAGE_KEY = `${host}-cart-${CART_STORAGE_VERSION}`;
    const PROMO_STORAGE_KEY = `${host}-promo`;
    try {
      const storedCart = localStorage.getItem(CART_STORAGE_KEY);
      if (storedCart) {
        const parsed: unknown = JSON.parse(storedCart);
        if (Array.isArray(parsed)) {
          // Drop any unrecognized variants from older builds.
          setCartItems(parsed.filter(isSupportedCartItem) as CartItem[]);
        }
      } else {
        // One-shot best-effort migration from the v1 key (tour/upsell only).
        const legacy = localStorage.getItem(`${host}-cart`);
        if (legacy) {
          try {
            const parsedLegacy: unknown = JSON.parse(legacy);
            if (Array.isArray(parsedLegacy)) {
              setCartItems(parsedLegacy.filter(isSupportedCartItem) as CartItem[]);
            }
          } catch {
            // ignore malformed legacy payload
          }
        }
      }
      const storedPromo = localStorage.getItem(PROMO_STORAGE_KEY);
      if (storedPromo) {
        setPromoCode(JSON.parse(storedPromo));
      }
    } catch (error) {
      console.error('Could not load cart from localStorage', error);
    }
  }, []);

  useEffect(() => {
    const host = typeof window === 'undefined' ? 'app' : window.location.host;
    const CART_STORAGE_KEY = `${host}-cart-${CART_STORAGE_VERSION}`;
    const PROMO_STORAGE_KEY = `${host}-promo`;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
      if (promoCode) {
        localStorage.setItem(PROMO_STORAGE_KEY, JSON.stringify(promoCode));
      } else {
        localStorage.removeItem(PROMO_STORAGE_KEY);
      }
    } catch (error) {
      console.error('Could not save cart to localStorage', error);
    }
  }, [cartItems, promoCode]);

  const addToCart = useCallback(
    (
      product: Tour | UpsellItem,
      productType: 'tour' | 'upsell',
      adults?: number,
      children?: number,
      date?: Date,
      quantity?: number,
      packageId?: string,
      packageName?: string
    ) => {
      let toastMessage: { title: string; description: string } | null = null;
      setCartItems((prevItems) => {
        const existingItem = prevItems.find(
          (item) =>
            item.product.id === product.id &&
            item.productType === productType &&
            // If packages are used, treat different packages as different items
            (item.packageId ?? 'base') === (packageId ?? 'base')
        );
        if (existingItem) {
          toastMessage = {
            title: 'Already in Cart',
            description: `${product.name} ${packageName ? `(${packageName})` : ''} is already in your cart.`,
          };
          return prevItems;
        }
        toastMessage = {
          title: 'Added to Cart',
          description: `${product.name} ${packageName ? `(${packageName})` : ''} has been added to your cart.`,
        };
        const newItem: CartItem =
          productType === 'tour'
            ? {
                productType: 'tour',
                product: product as Tour,
                packageId,
                packageName,
                adults,
                children,
                date,
              }
            : {
                productType: 'upsell',
                product: product as UpsellItem,
                packageId,
                packageName,
                quantity,
              };
        return [...prevItems, newItem];
      });
      if (toastMessage) {
        toast(toastMessage);
      }
    },
    [toast]
  );

  const removeFromCart = useCallback(
    (productId: string, productType: 'tour' | 'upsell', packageId?: string) => {
      let productName: string | undefined;
      setCartItems((prevItems) => {
        const itemToRemove = prevItems.find(
          (item) =>
            item.product.id === productId &&
            item.productType === productType &&
            (item.packageId ?? 'base') === (packageId ?? 'base')
        );
        if (itemToRemove) {
          productName = itemToRemove.product.name;
        }
        return prevItems.filter(
          (item) =>
            !(
              item.product.id === productId &&
              item.productType === productType &&
              (item.packageId ?? 'base') === (packageId ?? 'base')
            )
        );
      });

      if (productName) {
        toast({
          title: 'Removed from Cart',
          description: `"${productName}" has been removed from your cart.`,
        });
      }
    },
    [toast]
  );

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  // Stable cart-session id; resolved lazily on the client.
  const [cartSessionId, setCartSessionId] = useState<string>('ssr');
  useEffect(() => {
    setCartSessionId(getOrCreateSessionId());
  }, []);

  const placeHoldFor = useCallback(
    async (item: RoomCartItem, sessionId: string): Promise<string | null> => {
      if (!item.agencyId) return null;
      const ttlMs = CART_HOLD_TTL_MINUTES * 60_000;
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      try {
        await placeCartHold({
          agencyId: item.agencyId,
          roomTypeId: item.roomTypeId,
          checkIn: item.checkInDate,
          checkOut: item.checkOutDate,
          units: item.unitsBooked,
          lineId: item.lineId,
          sessionId,
          ttlMinutes: CART_HOLD_TTL_MINUTES,
        });
        return expiresAt;
      } catch {
        // Best-effort: never block the UI on hold failures.
        return null;
      }
    },
    []
  );

  const addRoomItem = useCallback(
    (input: AddRoomItemInput): string => {
      const lineId = input.lineId ?? generateLineId();
      const product = input.product ?? { id: input.roomTypeId, name: input.name };
      const addons = input.addons ?? [];
      const newItem: RoomCartItem = {
        productType: 'room',
        lineId,
        product,
        roomTypeId: input.roomTypeId,
        hotelId: input.hotelId,
        agencyId: input.agencyId,
        roomSlug: input.roomSlug,
        name: input.name,
        image: input.image ?? null,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        nights: input.nights,
        adults: input.adults,
        children: input.children,
        unitsBooked: input.unitsBooked,
        currency: input.currency,
        basePricePerNight: input.basePricePerNight,
        pricePerNightAvg: input.pricePerNightAvg,
        subtotal: input.subtotal,
        subtotalBeforeTier: input.subtotalBeforeTier,
        tier: input.tier,
        addons,
        holdSessionId: cartSessionId !== 'ssr' ? cartSessionId : undefined,
      };

      setCartItems((prev) => [...prev, newItem]);
      toast({
        title: 'Added to Cart',
        description: `${input.name} (${input.nights} night${input.nights === 1 ? '' : 's'}) has been added to your cart.`,
      });

      // Best-effort hold (fire and forget). Updates the line with the
      // expiry once the server confirms.
      if (cartSessionId !== 'ssr' && input.agencyId) {
        void placeHoldFor(newItem, cartSessionId).then((expiresAt) => {
          if (!expiresAt) return;
          setCartItems((prev) =>
            prev.map((i) =>
              i.productType === 'room' && i.lineId === lineId
                ? { ...i, holdExpiresAt: expiresAt, holdSessionId: cartSessionId }
                : i
            )
          );
        });
      }
      return lineId;
    },
    [toast, cartSessionId, placeHoldFor]
  );

  const updateRoomItem = useCallback(
    (lineId: string, patch: Partial<Omit<RoomCartItem, 'productType' | 'lineId'>>) => {
      setCartItems((prev) =>
        prev.map((item) => {
          if (item.productType !== 'room' || item.lineId !== lineId) return item;
          const merged: RoomCartItem = { ...item, ...patch };
          // If pricing-relevant fields changed but the caller did not pass an
          // explicit `subtotal`, recompute it from the merged shape.
          if (patch.subtotal === undefined) {
            merged.subtotal = computeRoomLineSubtotal(merged);
          }
          return merged;
        })
      );
    },
    []
  );

  const removeRoomItem = useCallback(
    (lineId: string) => {
      let removedName: string | undefined;
      setCartItems((prev) => {
        const target = prev.find((i) => i.productType === 'room' && i.lineId === lineId);
        if (target && target.productType === 'room') removedName = target.name;
        return prev.filter((i) => !(i.productType === 'room' && i.lineId === lineId));
      });
      // Fire-and-forget release; never blocks UX.
      void releaseCartHold({ lineId }).catch(() => undefined);
      if (removedName) {
        toast({
          title: 'Removed from Cart',
          description: `"${removedName}" has been removed from your cart.`,
        });
      }
    },
    [toast]
  );

  const refreshRoomHold = useCallback(
    async (lineId: string) => {
      if (cartSessionId === 'ssr') return;
      const target = cartItems.find(
        (i): i is RoomCartItem => i.productType === 'room' && i.lineId === lineId
      );
      if (!target) return;
      const expiresAt = await placeHoldFor(target, cartSessionId);
      if (!expiresAt) return;
      setCartItems((prev) =>
        prev.map((i) =>
          i.productType === 'room' && i.lineId === lineId
            ? { ...i, holdExpiresAt: expiresAt, holdSessionId: cartSessionId }
            : i
        )
      );
    },
    [cartItems, cartSessionId, placeHoldFor]
  );

  // Re-hold any room lines whose stored expiry has passed (best-effort,
  // happens once after the cart hydrates from localStorage).
  const didInitialRefreshRef = React.useRef(false);
  useEffect(() => {
    if (didInitialRefreshRef.current) return;
    if (cartSessionId === 'ssr') return;
    if (cartItems.length === 0) return;
    didInitialRefreshRef.current = true;

    const now = Date.now();
    const stale = cartItems.filter(
      (i): i is RoomCartItem =>
        i.productType === 'room' &&
        Boolean(i.agencyId) &&
        (!i.holdExpiresAt || Date.parse(i.holdExpiresAt) <= now)
    );
    if (stale.length === 0) return;

    void Promise.all(
      stale.map(async (item) => {
        const expiresAt = await placeHoldFor(item, cartSessionId);
        return expiresAt ? { lineId: item.lineId, expiresAt } : null;
      })
    ).then((updates) => {
      const map = new Map<string, string>();
      for (const u of updates) if (u) map.set(u.lineId, u.expiresAt);
      if (map.size === 0) return;
      setCartItems((prev) =>
        prev.map((i) =>
          i.productType === 'room' && map.has(i.lineId)
            ? { ...i, holdExpiresAt: map.get(i.lineId)!, holdSessionId: cartSessionId }
            : i
        )
      );
    });
  }, [cartItems, cartSessionId, placeHoldFor]);

  const getCartTotal = useCallback(() => {
    return cartItems.reduce((total, item) => {
      if (item.productType === 'tour') {
        const tour = item.product;
        const totalPeople = (item.adults ?? 0) + (item.children ?? 0);

        // Find specific package if selected
        const selectedPackage =
          item.packageId && tour.packages
            ? tour.packages.find((p) => p.id === item.packageId)
            : null;

        // Use package tiers if available, otherwise fallback to tour tiers
        const tiers = selectedPackage ? selectedPackage.priceTiers : tour.priceTiers;

        if (!tiers || tiers.length === 0) return total;

        const priceTier =
          tiers.find(
            (tier) =>
              totalPeople >= tier.minPeople &&
              (tier.maxPeople === null || totalPeople <= tier.maxPeople)
          ) || tiers[tiers.length - 1];

        const itemTotal =
          (item.adults ?? 0) * priceTier.pricePerAdult +
          (item.children ?? 0) * priceTier.pricePerChild;
        return total + itemTotal;
      } else if (item.productType === 'upsell') {
        const upsellItem = item.product;
        const variant =
          item.packageId && upsellItem.variants
            ? upsellItem.variants.find((v) => v.id === item.packageId)
            : undefined;
        const price = variant?.price ?? upsellItem.price;
        return total + price * (item.quantity ?? 1);
      } else if (item.productType === 'room') {
        // Room items are pre-priced server-side (`getRoomPriceQuote`) and the
        // resulting `subtotal` is stored on the line. Trust it here.
        return total + (item.subtotal ?? computeRoomLineSubtotal(item));
      }
      return total;
    }, 0);
  }, [cartItems]);

  const subtotal = getCartTotal;

  const getDiscountAmount = useCallback(() => {
    if (!promoCode) return 0;
    const subtotal = getCartTotal();

    // Check minimum order amount
    if (promoCode.minOrderAmount && subtotal < promoCode.minOrderAmount) {
      return 0;
    }

    let discount = 0;
    if (promoCode.type === 'percentage') {
      discount = (subtotal * promoCode.value) / 100;
      if (promoCode.maxDiscountAmount && discount > promoCode.maxDiscountAmount) {
        discount = promoCode.maxDiscountAmount;
      }
    } else {
      discount = promoCode.value;
    }

    // Ensure discount doesn't exceed subtotal
    return Math.min(discount, subtotal);
  }, [promoCode, getCartTotal]);

  const getFinalTotal = useCallback(() => {
    return getCartTotal() - getDiscountAmount();
  }, [getCartTotal, getDiscountAmount]);

  const applyPromoCode = useCallback(
    async (code: string) => {
      try {
        const subtotal = getCartTotal();
        const promo = await validatePromoCode(code, subtotal);
        setPromoCode(promo);
        toast({
          title: 'Promo Code Applied',
          description: `Discount of ${promo.type === 'percentage' ? `${promo.value}%` : `$${promo.value}`} applied!`,
        });
      } catch (error) {
        console.error(error);
        toast({
          title: 'Invalid Promo Code',
          description: error instanceof Error ? error.message : 'Could not apply promo code.',
          variant: 'destructive',
        });
        throw error;
      }
    },
    [getCartTotal, toast]
  );

  const removePromoCode = useCallback(() => {
    setPromoCode(null);
    toast({
      title: 'Promo Code Removed',
      description: 'The promo code has been removed from your cart.',
    });
  }, [toast]);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        items: cartItems,
        promoCode,
        addToCart,
        removeFromCart,
        addRoomItem,
        updateRoomItem,
        removeRoomItem,
        refreshRoomHold,
        cartSessionId,
        clearCart,
        getCartTotal,
        subtotal,
        applyPromoCode,
        removePromoCode,
        getDiscountAmount,
        getFinalTotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
