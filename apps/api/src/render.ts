import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
const exec = promisify(execFile);

export async function renderSlideshow(sceneFiles: string[], output: string) {
  if (!sceneFiles.length) throw new Error("No scenes to render");
  await fs.mkdir(path.dirname(output), { recursive: true });
  // Requires ffmpeg installed on the host. Each image is shown for 5 seconds.
  const args = ["-y"];
  for (const f of sceneFiles) args.push("-loop","1","-t","5","-i",f);
  const filter = sceneFiles.map((_,i)=>`[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[v${i}]`).join(";")
    + ";" + sceneFiles.map((_,i)=>`[v${i}]`).join("") + `concat=n=${sceneFiles.length}:v=1:a=0,format=yuv420p[v]`;
  args.push("-filter_complex", filter, "-map","[v]","-r","30","-movflags","+faststart",output);
  await exec("ffmpeg", args);
  return output;
}