import VideoContext from "./videocontext.js";

const canvas = document.querySelector("#canvas");
const videoctx = new VideoContext(canvas);

const videoNode = videoctx.video("../docs/assets/bg.mp4");
videoNode.startAt(0);
videoNode.stop(100);
videoNode.connect(videoctx.destination);

videoctx.play();
