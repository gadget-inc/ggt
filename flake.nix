{
  description = "Gadget development environment";

  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, flake-utils, nixpkgs }:
    (flake-utils.lib.eachSystem [
      "x86_64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ]
      (system: nixpkgs.lib.fix (flake:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        rec {
          packages =
            rec {
              git = pkgs.git;

              nix-direnv = pkgs.nix-direnv.override {
                enableFlakes = true;
              };

              nodejs = pkgs.nodejs-16_x;

              mkcert = pkgs.mkcert;
            };

          devShell = pkgs.mkShell {
            packages = builtins.attrValues packages;
          };
        }
      )));

  nixConfig.bash-prompt = "\[ggt-develop:\\w\]$ ";
}
