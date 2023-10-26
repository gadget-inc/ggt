type ms = number;
type s = number;

type AuthenticationType = AuthenticationTypeCustom | AuthenticationTypeLogin | AuthenticationTypeOAuth2;

interface Credentials {
  /** the username */
  user: string;
  /** then password */
  pass: string;
}

interface OAuth2 {
  /** User e-mail address */
  user?: string | undefined;
  /** Client ID value */
  clientId?: string | undefined;
  /** Client secret value */
  clientSecret?: string | undefined;
  /** Refresh token for an user */
  refreshToken?: string | undefined;
  /** Endpoint for token generation, defaults to 'https://accounts.google.com/o/oauth2/token' */
  accessUrl?: string | undefined;
  /** An existing valid accessToken */
  accessToken?: string | undefined;
  /** Private key for JSW */
  privateKey?: string | { key: string; passphrase: string } | undefined;
  /** Optional Access Token expire time in ms */
  expires?: ms | undefined;
  /** Optional TTL for Access Token in seconds */
  timeout?: s | undefined;
  /** Function to run when a new access token is required */
  provisionCallback?(user: string, renew: boolean, callback: (err: Error | null, accessToken: string, expires: number) => void): void;
  serviceClient?: string | undefined;
}

interface AuthenticationTypeCustom extends Credentials {
  /** indicates the authetication type, defaults to ‘login’, other option is ‘oauth2’ or ‘custom’ */
  type: "custom" | "Custom" | "CUSTOM";
  method: string;
}

interface AuthenticationTypeLogin extends Credentials {
  /** indicates the authetication type, defaults to ‘login’, other option is ‘oauth2’ or ‘custom’ */
  type?: "login" | "Login" | "LOGIN" | undefined;
}

interface AuthenticationTypeOAuth2 extends OAuth2 {
  /** indicates the authetication type, defaults to ‘login’, other option is ‘oauth2’ or ‘custom’ */
  type?: "oauth2" | "OAuth2" | "OAUTH2" | undefined;
}

export interface SMTPTransportConfig {
  /** the hostname or IP address to connect to (defaults to ‘localhost’) */
  host?: string | undefined;
  /** the port to connect to (defaults to 25 or 465) */
  port?: number | undefined;
  /** defines authentication data */
  auth?: AuthenticationType | undefined;
  /** defines if the connection should use SSL (if true) or not (if false) */
  secure?: boolean | undefined;
  name?: string | undefined;
  /** the local interface to bind to for network connections */
  localAddress?: string | undefined;
  /** how many milliseconds to wait for the connection to establish */
  connectionTimeout?: ms | undefined;
  /** how many milliseconds to wait for the greeting after connection is established */
  greetingTimeout?: ms | undefined;
  /** how many milliseconds of inactivity to allow */
  socketTimeout?: ms | undefined;
  /** how many milliseconds to wait for the DNS requests to be resolved */
  dnsTimeout?: ms | undefined;
  /** if set to true, then logs SMTP traffic without message content */
  transactionLog?: boolean | undefined;
  /** if set to true, then logs SMTP traffic and message content, otherwise logs only transaction events */
  debug?: boolean | undefined;
  /** defines preferred authentication method, e.g. ‘PLAIN’ */
  authMethod?: string | undefined;
  /** if true, uses LMTP instead of SMTP protocol */
  lmtp?: boolean | undefined;
}

export interface SendmailTransportConfig {
  sendmail: true;
  /** path to the sendmail command (defaults to ‘sendmail’) */
  path?: string | undefined;
  /** either ‘windows’ or ‘unix’ (default). Forces all newlines in the output to either use Windows syntax <CR><LF> or Unix syntax <LF> */
  newline?: string | undefined;
  /** an optional array of command line options to pass to the sendmail command (ie. ["-f", "foo@blurdybloop.com"]). This overrides all default arguments except for ’-i’ and recipient list so you need to make sure you have all required arguments set (ie. the ‘-f’ flag). */
  args?: string[] | undefined;
}

export interface StreamTransportConfig {
  streamTransport: true;
  /** if true, then returns the message as a Buffer object instead of a stream */
  buffer?: boolean | undefined;
  /** either ‘windows’ or ‘unix’ (default). Forces all newlines in the output to either use Windows syntax <CR><LF> or Unix syntax <LF> */
  newline?: string | undefined;
}

export interface JSONTransportConfig {
  jsonTransport: true;
  skipEncoding?: boolean | undefined;
}

export interface SESTransportConfig {
  /** is an option that expects an instantiated aws.SES object */
  SES: any; // aws-sdk.SES object
  /** How many messages per second is allowed to be delivered to SES */
  maxConnections?: number | undefined;
  /** How many parallel connections to allow towards SES */
  sendingRate?: number | undefined;
}
