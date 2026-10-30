export type UniformType = "float" | "color";

export interface Uniform {
  id: string;
  name: string;
  type: UniformType;
  float: {
    value: string;
    min: string;
    max: string;
  };
  color: {
    draft: string;
    valid: string;
  };
}
