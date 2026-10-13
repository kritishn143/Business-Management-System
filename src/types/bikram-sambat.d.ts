/** The package ships no types; only the functions we use are declared. */
declare module "bikram-sambat" {
  export function toBik(isoDate: string): { year: number; month: number; day: number };
  export function toBik_euro(isoDate: string): string;
  export function toBik_text(isoDate: string): string;
  export function toGreg(year: number, month: number, day: number): {
    year: number;
    month: number;
    day: number;
  };
  export function toGreg_text(year: number, month: number, day: number): string;
  export function daysInMonth(year: number, month: number): number;
}
