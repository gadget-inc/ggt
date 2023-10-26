const $storage = Symbol("object");

/**
 * Bag of key-values associated with the current actor running this request or action
 **/
export class Session {
  static fromInput(input?: Record<string, any>) {
    if (input) {
      return new Session(input.id, input);
    }
  }

  changedKeys = new Set<string>();
  ended = false;
  [$storage]: Record<string, any>;

  constructor(private _id: string | null, obj: Record<string, any>) {
    this[$storage] = obj;
  }

  get(key: string) {
    return this[$storage][key];
  }

  set(key: string, value: any) {
    this.changedKeys.add(key);
    this[$storage][key] = value;
  }

  delete(key: string) {
    this.changedKeys.add(key);
    this[$storage][key] = null;
  }

  end() {
    this.changedKeys.add("id");
    this.ended = true;
  }

  clearChanges() {
    this.changedKeys.clear();
  }

  get changed() {
    return this.changedKeys.size > 0;
  }

  toJSON() {
    return this[$storage];
  }

  toChangedJSON() {
    const changes: Record<string, any> = {};
    for (const key of this.changedKeys) {
      changes[key] = this[$storage][key];
    }
    return changes;
  }

  get id() {
    return this._id;
  }

  set id(value: string | null) {
    this._id = value;
    this.set("id", this._id);
  }
}
