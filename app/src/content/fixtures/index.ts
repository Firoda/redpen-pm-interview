/* Ghost-fill answers for the demo. Order: [main answer, follow-up 1, follow-up 2, follow-up 3].
   MASTER_PLAN section 12.4. met-101 is flawed on purpose; met-102 is the improved retry. */

export const DEMO_PROFILE_NAME = 'Ishita'

export const DEMO_ANSWERS: Record<string, string[]> = {
  'met-101': [
    "I'd look at engagement first. The main metric is number of splits created per day, and I'd also track DAU of the feature and how many users try it at least once in their first week. If those go up, the feature is working. On top of that I'd look at NPS for the app and maybe app store ratings, to see if people like it.",
    "Fair point. I'd also track how many splits actually get settled, maybe a settlement rate within a week, and how many reminders people have to send before a friend pays.",
    "Then revenue from fees becomes the main metric, because it's the easiest to move now and the business cares about it. I'd still keep splits created as a secondary number, and watch whether people stop using the feature after the fee comes in.",
    "I'd pick splits created per active user as the one number for the CEO. It is simple to explain, and I can show the trend every week without extra instrumentation.",
  ],
  'met-102': [
    "The goal of Reorder is to save repeat shoppers time on their weekly basket. North star: share of repeat orders placed through Reorder. Inputs: Reorder taps per repeat shopper and time from app open to checkout. Counter-metric: basket size and new-item discovery, because one-tap reorder could shrink baskets.",
    "I'd ship only if net revenue per repeat shopper is flat or up over four weeks. If it dips, I'd test an 'add something new' row inside the reorder flow to protect discovery before rolling out further to all cities.",
    "I'd baseline it from the beta cohort for two weeks, then set the target from the best-performing category, and review it after four weeks with the guardrail next to it so nobody celebrates one number alone.",
    "The one number is the share of repeat orders placed through Reorder, read together with basket size so a rise in one cannot hide a fall in the other. That is what I would show the head of category.",
  ],
  'pd-001': [
    "Before designing, I'd confirm the goal is repeat orders from customers aged 60 and above. There are two users here: the parent who receives the groceries and the child in another city who often pays by UPI. I'd design for the parent, because the repeat habit is hers, and treat the child as a helper. Her pains are small text, substitutions made without asking, and delivery staff leaving the bag at the gate. I'd build three things: a large-text simple reorder screen, a substitution approval step with a phone call option, and a doorstep handover with a one-tap child notification. If engineering can ship only one, I'd pick substitution approval, because it is the biggest trust breaker and cheap to build. I'd drop the voice assistant for now. I'd measure the share of 60+ customers who reorder within 30 days, with substitution complaints per hundred orders as the guardrail.",
    "The children usually place and pay, so I'd add a family link: the child can reorder for the parent and the parent only confirms receipt. The parent stays the main user, but the child gets order status.",
    "I'd ship substitution approval first. It affects every order, it is the top complaint, and it needs the least new infrastructure. The large-text redesign comes second, and I'd cut the voice assistant.",
    "Eight weeks in, I'd look at the 30-day reorder rate for 60+ customers. The hurt signal is a rise in cancelled orders or in delivery time because of the approval step, so I'd cap approval wait at two minutes.",
  ],
  'rca-001': [
    "First, I'd confirm what the metric is: completed orders, and whether placed orders also fell. Then I'd check the data is real, whether there was a tracking change, and compare to other cities. If only Bengaluru is down, I'd split by platform and app version, then check the funnel from sessions to menu views to checkout to payment. External factors come next: a competitor campaign, weather, holidays. My top hypothesis is a recent app release hurting payments on one platform, because that is cheap to verify and common. Second is a restaurant supply issue in the city. I'd check release dates and the checkout-to-payment conversion by platform first. Once found, I'd roll back or hotfix the same day and add an alert on payment conversion by version.",
    "I'd start with platform and version: Android versus iOS, and the latest release. If the drop sits on one version, that points to a release issue rather than demand.",
    "If sessions are flat and orders fell, the break is after menu views. I'd expect checkout-to-payment conversion to drop sharply for the affected group, and I'd check payment errors by bank and method.",
    "The Android release on Monday broke UPI payments for one bank. We are rolling back that SDK today and adding a payment-conversion alert per version so this is caught within an hour.",
  ],
}
