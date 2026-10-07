#include "albumArt.h"

#include <algorithm>
#include <cstring>

#include "apiAlbumArt.h"
#include "apiCore.h"
#include "apiFileManager.h"
#include "apiObjects.h"
#include "aimpHelper.h"
#include "md5.h"

namespace
{
	const char *ContentTypeFor(INT32 format)
	{
		switch (format)
		{
		case AIMP_IMAGE_FORMAT_JPG:
			return "image/jpeg";
		case AIMP_IMAGE_FORMAT_PNG:
			return "image/png";
		case AIMP_IMAGE_FORMAT_GIF:
			return "image/gif";
		default:
			return nullptr;
		}
	}

	std::optional<albumArt::Cover> Encode(IAIMPCore *core, IAIMPImage *image, INT32 format)
	{
		IAIMPMemoryStream *stream = nullptr;
		if (Failed(core->CreateObject(IID_IAIMPMemoryStream, reinterpret_cast<void **>(&stream))) || !stream)
			return std::nullopt;
		std::optional<albumArt::Cover> result;
		SIZE size{};
		if (Succeeded(image->SaveToStream(stream, format)) && stream->GetSize() > 0 && Succeeded(image->GetSize(&size)))
			result = albumArt::Cover{ContentTypeFor(format),
									 std::string(static_cast<const char *>(stream->GetData()), static_cast<std::size_t>(stream->GetSize())),
									 size.cx, size.cy};
		stream->Release();
		return result;
	}

	std::optional<albumArt::Cover> RawContent(IAIMPImageContainer *container)
	{
		SIZE size{};
		INT32 format = AIMP_IMAGE_FORMAT_UNKNOWN;
		container->GetInfo(&size, &format);
		const char *contentType = ContentTypeFor(format);
		if (!contentType || container->GetDataSize() == 0)
			return std::nullopt;
		return albumArt::Cover{contentType,
							   std::string(reinterpret_cast<const char *>(container->GetData()), container->GetDataSize()),
							   size.cx, size.cy};
	}

	struct Received
	{
		IAIMPCore *Core;
		std::optional<albumArt::Cover> Result;
	};

	// Bitmaps and other formats browsers do not show are re-encoded.
	void WINAPI OnCoverReceived(IAIMPImage *image, IAIMPImageContainer *container, void *userData)
	{
		auto *received = static_cast<Received *>(userData);
		if (container)
			received->Result = RawContent(container);
		if (received->Result)
			return;

		IAIMPImage *owned = nullptr;
		if (!image && container && Succeeded(container->CreateImage(&owned)))
			image = owned;
		if (image)
			received->Result = Encode(received->Core, image, AIMP_IMAGE_FORMAT_PNG);
		if (owned)
			owned->Release();
	}

	IAIMPImage *Decode(IAIMPCore *core, const albumArt::Cover &cover)
	{
		IAIMPImageContainer *container = nullptr;
		if (Failed(core->CreateObject(IID_IAIMPImageContainer, reinterpret_cast<void **>(&container))) || !container)
			return nullptr;
		IAIMPImage *image = nullptr;
		if (Succeeded(container->SetDataSize(static_cast<DWORD>(cover.Body.size()))) && container->GetData())
		{
			std::memcpy(container->GetData(), cover.Body.data(), cover.Body.size());
			if (Failed(container->CreateImage(&image)))
				image = nullptr;
		}
		container->Release();
		return image;
	}
}

std::optional<albumArt::Cover> albumArt::LoadCover(IAIMPCore *core, IAIMPFileInfo *fileInfo, unsigned flags)
{
	Received received{core, std::nullopt};
	IAIMPServiceAlbumArt *service = nullptr;
	if (Succeeded(core->QueryInterface(IID_IAIMPServiceAlbumArt, reinterpret_cast<void **>(&service))) && service)
	{
		TTaskHandle task = 0;
		const DWORD serviceFlags = AIMP_SERVICE_ALBUMART_FLAGS_WAITFOR | ((flags & Refresh) ? AIMP_SERVICE_ALBUMART_FLAGS_NOCACHE : 0) |
								   ((flags & Original) ? AIMP_SERVICE_ALBUMART_FLAGS_ORIGINAL : 0);
		service->Get2(fileInfo, serviceFlags, OnCoverReceived, &received, &task);
		service->Release();
	}
	return received.Result;
}

std::optional<albumArt::Cover> albumArt::ScaleCover(IAIMPCore *core, const Cover &cover, int size)
{
	if (std::max(cover.Width, cover.Height) <= size)
		return cover;
	IAIMPImage *image = Decode(core, cover);
	if (!image)
		return std::nullopt;
	const double scale = static_cast<double>(size) / std::max(cover.Width, cover.Height);
	const INT32 width = std::max(1, static_cast<INT32>(cover.Width * scale + 0.5));
	const INT32 height = std::max(1, static_cast<INT32>(cover.Height * scale + 0.5));
	std::optional<Cover> result;
	// Only a PNG may have something, such as transparency, to lose in JPEG.
	if (Succeeded(image->Resize(width, height)))
		result = Encode(core, image, cover.ContentType == "image/png" ? AIMP_IMAGE_FORMAT_PNG : AIMP_IMAGE_FORMAT_JPG);
	image->Release();
	return result;
}

std::string albumArt::ContentHash(const Cover &cover)
{
	return Md5Hex(cover.Body);
}
