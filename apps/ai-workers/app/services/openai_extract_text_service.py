import base64
from openai import OpenAI

client = OpenAI()

def extract_text_from_images(images: list[bytes]) -> str:
    full_text = ""

    for img_bytes in images:
        base64_image = base64.b64encode(img_bytes).decode("utf-8")

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You extract text from resume images accurately."
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract all text from this resume page."},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=2000
        )

        page_text = response.choices[0].message.content
        full_text += page_text + "\n"

    return full_text