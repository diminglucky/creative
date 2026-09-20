-- Seed pricing for every statically-registered video model.
--
-- The generation registry (apps/server/src/generation/providers/register-all.ts)
-- already exposes these models at runtime, but the charge_generation RPC raises
-- PRICE_NOT_FOUND for any (model_id, 'video') row missing from generation_prices,
-- which blocked 24 of the 25 registered video models (everything except
-- google-official/veo-3.1-generate-preview).
--
-- credit_price = base cost from VIDEO_MODEL_COSTS (5s @ 720p baseline);
-- money_price_fen is historical (1 credit = 10 fen) and kept for parity.
-- Administrators can adjust these from the admin model catalog afterwards.
insert into public.generation_prices
  (model_id, generation_type, display_name, provider_id, credit_price, money_price_fen, minimum_plan, enabled)
values
  ('google-official/veo-3.1-fast-generate-preview', 'video', 'Veo 3.1 Fast', 'google', 60, 600, 'pro', true),
  ('google-official/veo-3.1-lite-generate-preview', 'video', 'Veo 3.1 Lite', 'google', 30, 300, 'starter', true),
  ('google-official/veo-3.0-generate-001', 'video', 'Veo 3', 'google', 70, 700, 'pro', true),
  ('google-official/veo-3.0-fast-generate-001', 'video', 'Veo 3 Fast', 'google', 50, 500, 'pro', true),
  ('google-official/veo-2.0-generate-001', 'video', 'Veo 2', 'google', 20, 200, 'starter', true),
  ('google-vertex/veo-3.1-generate-001', 'video', 'Veo 3.1 (Vertex)', 'google-vertex', 80, 800, 'pro', true),
  ('google-vertex/veo-3.1-fast-generate-001', 'video', 'Veo 3.1 Fast (Vertex)', 'google-vertex', 60, 600, 'pro', true),
  ('google-vertex/veo-3.1-lite-generate-001', 'video', 'Veo 3.1 Lite (Vertex)', 'google-vertex', 30, 300, 'starter', true),
  ('google-vertex/veo-3.0-generate-001', 'video', 'Veo 3 (Vertex)', 'google-vertex', 70, 700, 'pro', true),
  ('google-vertex/veo-3.0-fast-generate-001', 'video', 'Veo 3 Fast (Vertex)', 'google-vertex', 50, 500, 'pro', true),
  ('google-vertex/veo-2.0-generate-001', 'video', 'Veo 2 (Vertex)', 'google-vertex', 20, 200, 'starter', true),
  ('kwaivgi/kling-v3-video', 'video', 'Kling 3.0', 'replicate', 50, 500, 'pro', true),
  ('kwaivgi/kling-v3-omni-video', 'video', 'Kling 3.0 Omni', 'replicate', 40, 400, 'pro', true),
  ('kwaivgi/kling-v2.6', 'video', 'Kling 2.6', 'replicate', 25, 250, 'starter', true),
  ('kwaivgi/kling-o1', 'video', 'Kling O1', 'replicate', 30, 300, 'pro', true),
  ('bytedance/seedance-1.5-pro', 'video', 'Seedance 1.5 Pro', 'replicate', 25, 250, 'pro', true),
  ('wan-video/wan-2.6', 'video', 'Wan 2.6', 'replicate', 25, 250, 'starter', true),
  ('openai/sora-2', 'video', 'Sora 2', 'replicate', 40, 400, 'pro', true),
  ('openai/sora-2-pro', 'video', 'Sora 2 Pro', 'replicate', 120, 1200, 'ultra', true),
  ('google/veo-3', 'video', 'Veo 3', 'replicate', 100, 1000, 'pro', true),
  ('google/veo-3.1', 'video', 'Veo 3.1', 'replicate', 100, 1000, 'pro', true),
  ('google/veo-3.1-fast', 'video', 'Veo 3.1 Fast', 'replicate', 40, 400, 'pro', true),
  ('minimax/hailuo-2.3', 'video', 'Hailuo 2.3', 'replicate', 20, 200, 'starter', true),
  ('metaso/minimax-h3', 'video', 'MiniMax H3 (Metaso)', 'metaso', 51, 510, 'starter', true)
on conflict (model_id, generation_type) do nothing;
