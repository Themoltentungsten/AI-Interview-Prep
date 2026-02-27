import base64
from openai import OpenAI
from app.core.config import settings
client = OpenAI(
    api_key=settings.OPENAI_API_KEY
)

def ocr_images_with_openai(page_images: list[bytes]) -> str:
    extracted_pages = []

    for img_bytes in page_images:
        base64_image = base64.b64encode(img_bytes).decode("utf-8")

        response = client.responses.create(
            model="gpt-4o-mini",  # vision-capable + cost efficient
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": "Extract all readable text from this image. Return plain text only."
                        },
                        {
                            "type": "input_image",
                            "image_url": f"data:image/png;base64,{base64_image}"
                        }
                    ]
                }
            ],
        )

        page_text = response.output_text
        extracted_pages.append(page_text)

    return "\n\n".join(extracted_pages)