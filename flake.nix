{
  description = "GGT development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    (flake-utils.lib.eachDefaultSystem (system: nixpkgs.lib.fix (flake:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages = {
          corepack = pkgs.corepack;
          direnv = pkgs.direnv;
          git = pkgs.git;
          mkcert = pkgs.mkcert;
          nix-direnv = pkgs.nix-direnv;
          nixpkgs-fmt = pkgs.nixpkgs-fmt;
          nodejs = pkgs.nodejs-18_x;
          yarn = pkgs.yarn.override { nodejs = flake.packages.nodejs; };

          ggt = pkgs.writeShellScriptBin "ggt" ''
            GGT_ENV=production "$WORKSPACE_ROOT"/dist/main.js "$@"
          '';

          dggt = pkgs.writeShellScriptBin "dggt" ''
            GGT_ENV=development "$WORKSPACE_ROOT"/dist/main.js
          '';
        };

        devShell = pkgs.mkShell {
          packages = builtins.attrValues flake.packages;
        };
      }
    )));

  nixConfig.bash-prompt = "\[ggt-develop:\\w\]$ ";
}
