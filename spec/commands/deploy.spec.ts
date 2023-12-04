import { nockTestApps, testApp } from "../__support__/app.js";
import { createMockEditGraphQL, nockEditGraphQLResponse, type MockEditGraphQL } from "../__support__/edit-graphql.js";
import { loginTestUser } from "../__support__/user.js";
import { Action, FileSync } from "../../src/services/filesync/filesync.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testDirPath } from "../__support__/paths.js";
import type { RootArgs } from "../../src/commands/root.js";
import { log } from "../__support__/debug.js";
import * as prompt from "../../src/services/output/prompt.js";
import nock from "nock";
import { command as deploy } from "../../src/commands/deploy.js";
import { REMOTE_FILES_VERSION_QUERY, REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION } from "../../src/services/app/edit-graphql.js";
import { writeDir } from "../__support__/files.js";
import { prettyJSON } from "../__support__/json.js";
import { getUser } from "../../src/services/user/user.js";
import { expectProcessExit } from "../__support__/process.js";
import { mockProcessExit } from "vitest-mock-process";
import { config } from "../../src/services/config/config.js";


describe("deploy", () => {
    let rootArgs: RootArgs;
    let mockEditGraphQL: MockEditGraphQL;
    let filesync: FileSync;
    let appDir: string;
    let appDirPath: (...segments: string[]) => string;
    let stop: () => Promise<void>;
    
    beforeEach(async() => {
        // loginTestUser();
        nockTestApps();
        mockEditGraphQL = createMockEditGraphQL();
        
        appDirPath = (...segments: string[]) => testDirPath("app", ...segments);
        appDir = appDirPath();
        
        rootArgs = {
            _: [
              appDir,
              "--app",
              testApp.slug
            ]
        }
        
        const originalInit = FileSync.init;
        vi.spyOn(FileSync, "init").mockImplementation(async (args) => {
          try {
            filesync = await originalInit(args);
            return filesync;
          } catch (error) {
            log.error("failed to initialize filesync", { error });
            process.exit(1);
          }
        });
    
        // vi.spyOn(prompt, "confirm").mockImplementation(() => {
        //   log.error("prompt.confirm() should not be called");
        //   process.exit(1);
        // });
    
        // vi.spyOn(prompt, "select").mockImplementation(() => {
        //   log.error("prompt.select() should not be called");
        //   process.exit(1);
        // });
        
        // await loginTestUser();

    })
    
    afterEach(async () => {
        if (stop) {
            await stop();
          }
    
          expect(nock.pendingMocks()).toEqual([]);
    })
    
    it("does not try to deploy if local files are not up to date with remote", async () => {
        vi.spyOn(prompt, "select").mockResolvedValue(Action.RESET);

        await loginTestUser();
        await writeDir(appDir, {
            ".gadget/sync.json": prettyJSON({ app: "test", filesVersion: "1", mtime: Date.now() - 1000 }),
            "foo.js": "foo",
        });
        
        // this one is used by deploy
        await void nockEditGraphQLResponse({ query: REMOTE_FILES_VERSION_QUERY, response: { data: { remoteFilesVersion: "1" } } });
        // this one is used by sync
        await void nockEditGraphQLResponse({ query: REMOTE_FILES_VERSION_QUERY, response: { data: { remoteFilesVersion: "1" } } });
        
        await void nockEditGraphQLResponse({ query: REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION, response: { data: {publishServerContractStatus : undefined } }});

        await deploy(rootArgs);
        
        expect(nock.pendingMocks().length).toEqual(1)
        expect(nock.pendingMocks()[0]).toEqual(`POST https://test--development.${config.domains.app}:443/edit/api/graphql`)
        nock.cleanAll();
    })
    
    it("prompts the user how to proceed if local files are not up to date with remote", () => {
        // local files have changed since you last synced, how would you liek to proceed...
    })
    
    it("does not try to deploy if a sync is already in progress", () => {
        console.log("test")
    })
    
    it("shows the problems if any exist and does not try to deploy", () => {
        console.log("test")
    })
    
    it("deploys anyways even if there are problems if deploying with force flag", () => {
        console.log("test")
    })
    
    it("deploys if there are no problems with the app", () => {
        console.log("test")
    })
    
})