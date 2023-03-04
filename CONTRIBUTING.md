# Contributing to `ggt`

Contributions to `ggt` are welcomed from all! Contributors must adhere to the Code of Conduct for the ggt product, outlined in the CODE_OF_CONDUCT.md document.

## System dependencies

`ggt` uses Nix to manage system dependencies like `node` and `npm`. You don't need to use Nix to contribute to `ggt`, but it does make things easier!

## Running tests

Run:

```shell
npm run test
```

to run all the test using Jest.

## Running the dev version

To run the dev version of the full CLI, run:

```shell
bin/dev <args>
```

By default, the dev version of the CLI runs against the development version of Gadget used by Gadget staff. This is because `bin/dev` defaults the `GGT_ENV` variable to `"development"`. You can override this to use the production Gadget platform by using `GGT_ENV=production bin/dev`.
