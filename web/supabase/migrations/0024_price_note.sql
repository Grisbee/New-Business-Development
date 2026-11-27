-- Listed events: the price as the organiser gives it ("From NT$1,800",
-- "Free", "Prices on site"), shown instead of the in-app price.
alter table public.events add column price_note text check (char_length(price_note) <= 40);
