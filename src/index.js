import VideoContext from "./videocontext.js";

const canvas = document.querySelector("#canvas");
const videoctx = new VideoContext(canvas);

const videoNode = videoctx.video("../docs/assets/bg.mp4");
videoNode.startAt(0);

// const effectNode = videoctx.effect(VideoContext.DEFINITIONS.MONOCHROME);

// videoNode.connect(effectNode);
videoNode.connect(videoctx.destination);

videoctx.play();
