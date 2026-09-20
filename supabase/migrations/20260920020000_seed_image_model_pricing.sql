-- Seed pricing for every statically-registered image model.
--
-- Same root cause as 20260920010000_seed_video_model_pricing.sql: the image
-- generation registry (replicate-image / google-image / google-vertex-image)
-- exposes these models, but charge_generation raises PRICE_NOT_FOUND for any
-- (model_id, 'image') row missing here — blocking 16 of 17 image models.
--
-- credit_price = "hd" quality cost from IMAGE_MODEL_COSTS (matches the existing
-- flux-kontext-pro seed, which also used its hd value). money_price_fen is
-- historical (1 credit = 10 fen). minimum_plan follows MODEL_MIN_TIER; the
-- google-vertex gemini entries mirror their google-official tier counterparts.
insert into public.generation_prices
  (model_id, generation_type, display_name, provider_id, credit_price, money_price_fen, minimum_plan, enabled)
values
  ('black-forest-labs/flux-kontext-max', 'image', 'Flux Kontext Max', 'replicate', 18, 180, 'pro', true),
  ('bytedance/seedream-4', 'image', 'Seedream 4', 'replicate', 4, 40, 'starter', true),
  ('bytedance/seedream-4.5', 'image', 'Seedream 4.5', 'replicate', 5, 50, 'starter', true),
  ('bytedance/seedream-5-lite', 'image', 'Seedream 5.0 Lite', 'replicate', 6, 60, 'starter', true),
  ('google-official/gemini-2.5-flash-image', 'image', 'Nano Banana', 'google', 10, 100, 'free', true),
  ('google-official/gemini-3-pro-image-preview', 'image', 'Nano Banana Pro', 'google', 10, 100, 'pro', true),
  ('google-official/gemini-3.1-flash-image-preview', 'image', 'Nano Banana 2', 'google', 10, 100, 'free', true),
  ('google-vertex/gemini-2.5-flash-image', 'image', 'Nano Banana (Vertex)', 'google-vertex', 10, 100, 'free', true),
  ('google-vertex/gemini-3-pro-image-preview', 'image', 'Nano Banana Pro (Vertex)', 'google-vertex', 10, 100, 'pro', true),
  ('google-vertex/gemini-3.1-flash-image-preview', 'image', 'Nano Banana 2 (Vertex)', 'google-vertex', 10, 100, 'free', true),
  ('google/imagen-4', 'image', 'Imagen 4', 'replicate', 10, 100, 'starter', true),
  ('google/nano-banana', 'image', 'Nano Banana', 'replicate', 10, 100, 'free', true),
  ('google/nano-banana-2', 'image', 'Nano Banana 2', 'replicate', 8, 80, 'starter', true),
  ('google/nano-banana-pro', 'image', 'Nano Banana Pro', 'replicate', 10, 100, 'starter', true),
  ('openai/gpt-image-1.5', 'image', 'GPT Image 1.5', 'replicate', 8, 80, 'starter', true),
  ('recraft-ai/recraft-v3', 'image', 'Recraft V3', 'replicate', 10, 100, 'starter', true)
on conflict (model_id, generation_type) do nothing;
