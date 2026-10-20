ALTER TABLE salon.services
  ADD COLUMN category text NOT NULL DEFAULT 'other'
  CHECK (category IN ('hair','nails','barber','spa','massage','beauty','other'));

-- Classify the existing catalogue once. Owners can correct it in Services.
UPDATE salon.services SET category = CASE
  WHEN lower(name) ~ '(manicura|pedicura|uñas)' THEN 'nails'
  WHEN lower(name) ~ '(barber|barba|afeitado)' THEN 'barber'
  WHEN lower(name) ~ '(masaje|descontracturante)' THEN 'massage'
  WHEN lower(name) ~ '(facial|spa|exfolia|limpieza de cutis)' THEN 'spa'
  WHEN lower(name) ~ '(cejas|pestañas|maquillaje|depila)' THEN 'beauty'
  WHEN lower(name) ~ '(corte|color|capilar|peinado|mechas|alisado|balayage)' THEN 'hair'
  ELSE 'other' END;
