import {describe, expect, test} from "bun:test";
import {extractAndNormalizeImagesFromText} from "../image.processor.ts";

describe("Image Processor", () => {
  test("returns unchanged text if no image paths are present", async () => {
    const res = await extractAndNormalizeImagesFromText("Hola mundo, arregla este bug.");
    expect(res.cleanedText).toBe("Hola mundo, arregla este bug.");
    expect(res.images.length).toBe(0);
  });

  test("does not crash if nonexistent image path is given", async () => {
    const res = await extractAndNormalizeImagesFromText('Revisa "/tmp/non_existent_image_12345.png" y dime qué ves.');
    expect(res.images.length).toBe(0);
  });
});
