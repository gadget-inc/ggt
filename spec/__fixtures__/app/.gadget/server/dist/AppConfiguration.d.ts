/**
* A map from configuration value name to value all the configuration values and secrets in test.
* __Note__: Any encrypted configuration values are decrypted and ready for use in this map.
*/
export interface AppConfiguration {
    /**
    * The value for the NODE_ENV set in the Gadget Environment Variables settings section.
    */
    NODE_ENV: string;
}
