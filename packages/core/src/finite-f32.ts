// Maximum finite f32, exactly representable as a JavaScript number.
export const MAX_F32 = (2 - 2 ** -23) * 2 ** 127;

/** A source number may round to f32, but cannot exceed the finite f32 range. */
export function isFiniteF32(value: number): boolean {
  return (
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_F32 &&
    Number.isFinite(Math.fround(value))
  );
}
