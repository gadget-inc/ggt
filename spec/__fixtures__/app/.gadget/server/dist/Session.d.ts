declare const $storage: unique symbol;
/**
 * Bag of key-values associated with the current actor running this request or action
 **/
export declare class Session {
    private _id;
    static fromInput(input?: Record<string, any>): Session | undefined;
    changedKeys: Set<string>;
    ended: boolean;
    [$storage]: Record<string, any>;
    constructor(_id: string | null, obj: Record<string, any>);
    get(key: string): any;
    set(key: string, value: any): void;
    delete(key: string): void;
    end(): void;
    clearChanges(): void;
    get changed(): boolean;
    toJSON(): Record<string, any>;
    toChangedJSON(): Record<string, any>;
    get id(): string | null;
    set id(value: string | null);
}
export {};
