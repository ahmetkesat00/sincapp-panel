export default async function getCroppedImg(
  imageSrc: string,
  crop: any,
  outputWidth?: number,
  outputHeight?: number
) {
  const image = new Image();
  image.src = imageSrc;

  await new Promise((resolve) => {
    image.onload = resolve;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = outputWidth ?? crop.width;
  canvas.height = outputHeight ?? crop.height;

  ctx?.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
  });
}