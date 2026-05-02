import { getReviews } from '@/lib/supabase/reviews';
import { ReviewsClient } from './reviews-client';

export default async function AdminReviewsPage() {
  const reviews = await getReviews();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Reviews & Ratings</h2>
        <p className="text-muted-foreground">Moderate customer reviews for tours and hotels.</p>
      </div>
      <ReviewsClient initialReviews={reviews} />
    </div>
  );
}
