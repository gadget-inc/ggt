import { Client } from ".";
declare global {
    interface Window {
        Gadget: typeof Client;
    }
}
