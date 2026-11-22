-- ADR-0012: el encargado abre y cierra el gimnasio (con motivo opcional) y
-- define la capacidad máxima. Idempotente: en una base nueva schema.sql ya
-- crea estas columnas y restricciones.

ALTER TABLE aforo_estado
  ADD COLUMN IF NOT EXISTS capacidad_maxima INTEGER NOT NULL DEFAULT 30;

ALTER TABLE aforo_estado
  ADD COLUMN IF NOT EXISTS abierto BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE aforo_estado
  ADD COLUMN IF NOT EXISTS motivo_cierre TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'aforo_estado_capacidad_rango_check'
  ) THEN
    ALTER TABLE aforo_estado ADD CONSTRAINT aforo_estado_capacidad_rango_check
      CHECK (capacidad_maxima BETWEEN 1 AND 10000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'aforo_estado_motivo_longitud_check'
  ) THEN
    ALTER TABLE aforo_estado ADD CONSTRAINT aforo_estado_motivo_longitud_check
      CHECK (motivo_cierre IS NULL OR char_length(motivo_cierre) <= 200);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'aforo_estado_motivo_solo_cerrado_check'
  ) THEN
    ALTER TABLE aforo_estado ADD CONSTRAINT aforo_estado_motivo_solo_cerrado_check
      CHECK (NOT abierto OR motivo_cierre IS NULL);
  END IF;
END $$;
