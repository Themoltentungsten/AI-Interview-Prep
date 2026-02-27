import requests
from io import BytesIO
from app.core.config import settings


def download_resume(key: str) -> BytesIO:
    url = f"{settings.CDN_BASE_URL}/{key}"

    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()

        return BytesIO(response.content)

    except requests.exceptions.Timeout:
        raise Exception(f"Timeout while downloading resume: {key}")

    except requests.exceptions.HTTPError as e:
        raise Exception(f"HTTP error while downloading resume: {e}")

    except requests.exceptions.RequestException as e:
        raise Exception(f"Failed to download resume: {e}")