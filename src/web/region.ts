// Die gewählte Stadt für Stellen ohne direkten Zugriff auf den App-Zustand
// (Notruf-Knöpfe, Einführung). Wird von App bei jedem Stadtwechsel gesetzt.

let current = 'wien';

export const setCurrentCity = (city: string) => {
  current = city;
};
export const currentCity = () => current;
