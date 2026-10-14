"use strict";
const fs=require("fs"),path=require("path");
const root=path.resolve(__dirname,"..");
const replay=path.join(root,"training/output/lab/g6/replay-buffer-g6.jsonl");
const report={schema:"g6-status-v1",stage:"G6.1",replayExists:fs.existsSync(replay),replaySamples:fs.existsSync(replay)?fs.readFileSync(replay,"utf8").split("\n").filter(Boolean).length:0,next:"connect selfplay -> replay -> N64 training"};
console.log(JSON.stringify(report,null,2));
