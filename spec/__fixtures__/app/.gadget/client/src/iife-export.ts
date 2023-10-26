import { Client } from "."

declare global {
  interface Window { Gadget: typeof Client; }
}

const previousValue = window.Gadget;
window.Gadget = Client;
(window.Gadget as any).previousValue = previousValue;