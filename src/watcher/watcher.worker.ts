import type { Monster } from "@types";
import copy from "fast-copy";
import type { CachedMetadata } from "obsidian";
import { transformTraits } from "src/util/util";

export interface DebugMessage {
    type: "debug";
    debug: boolean;
}

export interface QueueMessage {
    type: "queue";
    paths: string[];
}
export interface FileCacheMessage {
    type: "file";
    path: string;
    cache: CachedMetadata;
    file: { path: string; basename: string; mtime: number };
}
export interface GetFileCacheMessage {
    type: "get";
    path: string;
}
export interface FinishFileMessage {
    type: "done";
    path: string;
}
export interface UpdateEventMessage {
    type: "update";
    monster: Monster;
    path: string;
}
export interface SaveMessage {
    type: "save";
}

const ctx: Worker = self as any;
class Parser {
    queue: string[] = [];
    parsing: boolean = false;
    debug: boolean;

    constructor() {
        //Add Files to Queue
        ctx.addEventListener("message", (event: MessageEvent<QueueMessage>) => {
            if (event.data.type == "queue") {
                this.add(...event.data.paths);

                if (this.debug) {
                    console.debug(
                        `TTRPG: Received queue message for ${event.data.paths.length} paths`
                    );
                }
            }
        });
        ctx.addEventListener("message", (event: MessageEvent<DebugMessage>) => {
            if (event.data.type == "debug") {
                this.debug = event.data.debug;
            }
        });
    }
    add(...paths: string[]) {
        if (this.debug) {
            console.debug(`TTRPG: Adding ${paths.length} paths to queue`);
        }
        this.queue.push(...paths);
        if (!this.parsing) this.parse();
    }
    async parse() {
        this.parsing = true;
        while (this.queue.length) {
            const path = this.queue.shift();
            if (this.debug) {
                console.debug(
                    `TTRPG: Parsing ${path} for statblocks (${this.queue.length} to go)`
                );
            }
            const { file, cache } = await this.getFileData(path);
            this.parseFileForCreatures(file, cache);
            ctx.postMessage<FinishFileMessage>({ type: "done", path });
        }
        this.parsing = false;
        ctx.postMessage<SaveMessage>({ type: "save" });
    }
    async getFileData(path: string): Promise<FileCacheMessage> {
        return new Promise((resolve) => {
            ctx.addEventListener(
                "message",
                (event: MessageEvent<FileCacheMessage>) => {
                    if (event.data.type == "file") {
                        resolve(event.data);
                    }
                }
            );
            ctx.postMessage<GetFileCacheMessage>({ path, type: "get" });
        });
    }
    parseFileForCreatures(
        file: { path: string; basename: string; mtime: number },
        cache: CachedMetadata
    ) {
        if (!cache) return;
        if (!cache.frontmatter) return;
        if (!cache.frontmatter.statblock) return;
        if (!cache.frontmatter.name) return;
        const monster: Monster = Object.assign({}, copy(cache.frontmatter), {
            note: file.path,
            mtime: file.mtime
        });

        if (monster.traits) {
            monster.traits = transformTraits([], monster.traits);
        }
        if (monster.actions) {
            monster.actions = transformTraits([], monster.actions);
        }
        if (monster.bonus_actions) {
            monster.bonus_actions = transformTraits([], monster.bonus_actions);
        }
        if (monster.reactions) {
            monster.reactions = transformTraits([], monster.reactions);
        }
        if (monster.legendary_actions) {
            monster.legendary_actions = transformTraits(
                [],
                monster.legendary_actions
            );
        }

        if (this.debug)
            console.debug(
                `TTRPG: Adding ${monster.name} to bestiary from ${file.basename}`
            );

        ctx.postMessage<UpdateEventMessage>({
            type: "update",
            monster,
            path: file.path
        });
    }
}
new Parser();
