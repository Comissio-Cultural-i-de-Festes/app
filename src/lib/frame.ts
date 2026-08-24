/**
 * One frame out of a running camera.
 *
 * Both photographs in the app are taken from a `<video>` that is already
 * streaming — the scanner's rear camera, and the front camera on the exit
 * screen. So there is no second `getUserMedia`, no second permission prompt,
 * and no black flash: the picture is a frame that was going to be drawn
 * anyway, copied into a canvas.
 *
 * Smaller than a cover on purpose. `door-photos` has a two-megabyte ceiling
 * against `event-covers`' five, and a face at a door is never looked at bigger
 * than a phone screen, so 1080 on the long edge is already more than anybody
 * sees. A poster is the thing you zoom into; this is not.
 */

const MAX_EDGE = 1080
const JPEG_QUALITY = 0.8

export async function captureFrame(video: HTMLVideoElement | null): Promise<Blob | null> {
  // `videoWidth` is 0 until the first frame has arrived. Grabbing before that
  // yields a canvas of nothing, which would upload as a black rectangle.
  if (video === null || video.videoWidth === 0 || video.videoHeight === 0) return null

  const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)

  const context = canvas.getContext('2d')
  if (context === null) return null
  context.drawImage(video, 0, 0, canvas.width, canvas.height)

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  })
}
