#include "playlistsController.h"

#include "apiErrors.h"

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <optional>
#include <utility>
#include <string>
#include <system_error>
#include <vector>

#include <nlohmann/json.hpp>

#include "apiPlaylists.h"
#include "helpers/contentDisposition.h"
#include "helpers/itemJson.h"
#include "helpers/requestHelpers.h"
#include "delphiDateTime.h"
#include "mainThreadRunner.h"
#include "player/locate.h"
#include "player/lyrics.h"
#include "player/playlistItems.h"
#include "player/playlists.h"
#include "player/trackFile.h"
#include "player/trackInfo.h"
#include "player/uploads.h"
#include "settings.h"
#include "stateUpdateEvents.h"
#include "utf8Path.h"

namespace
{
	using webapi::CheckRevision;
	using webapi::DefaultPageLimit;
	using webapi::MaxPageLimit;
	using webapi::MoveBody;
	using webapi::OptionalField;
	using webapi::QueryInt;
	using webapi::QueryString;
	using webapi::RevisionOf;
	using webapi::SearchText;
	using webapi::SelectionBody;
	using webapi::StringArray;
	using webapi::ThrowUnlessOk;

	const char *LyricsTypeName(player::LyricsType type)
	{
		switch (type)
		{
		case player::LyricsType::Unsynced:
			return "unsynced";
		case player::LyricsType::Synced:
			return "synced";
		default:
			return "none";
		}
	}

	nlohmann::json ToJson(const player::Lyrics &lyrics)
	{
		nlohmann::json lines = nlohmann::json::array();
		for (const player::LyricsLine &line : lyrics.Lines)
		{
			nlohmann::json json{{"text", line.Text}};
			if (lyrics.Type == player::LyricsType::Synced)
				json["time"] = line.Time;
			lines.push_back(std::move(json));
		}
		return {{"type", LyricsTypeName(lyrics.Type)}, {"lines", std::move(lines)}};
	}

	// A scheme and "://", which no path has.
	bool IsUrl(const std::string &text)
	{
		const std::size_t colon = text.find("://");
		if (colon == std::string::npos || colon == 0)
			return false;
		return std::all_of(text.begin(), text.begin() + static_cast<std::ptrdiff_t>(colon), [](unsigned char c)
						   { return std::isalnum(c) || c == '+' || c == '-' || c == '.'; });
	}

	bool EnabledBody(const nlohmann::json &body)
	{
		if (!body.is_object() || !body.contains("enabled") || !body["enabled"].is_boolean())
			throw ApiError(400, "invalidBody");
		return body["enabled"].get<bool>();
	}

	nlohmann::json ToJson(const player::PlaylistInfo &playlist, std::uint64_t revision)
	{
		return {
			{"id", playlist.Id},
			{"name", playlist.Name},
			{"readOnly", playlist.ReadOnly},
			{"itemCount", playlist.ItemCount},
			{"duration", playlist.Duration},
			{"size", playlist.Size},
			{"revision", revision},
			{"showNumbers", playlist.ShowNumbers},
			{"absoluteNumbers", playlist.AbsoluteNumbers},
			{"showDuration", playlist.ShowDuration},
			{"showSecondLine", playlist.ShowSecondLine},
			{"showThumbnails", playlist.ShowThumbnails},
			{"showMarks", playlist.ShowMarks},
			{"showSwitches", playlist.ShowSwitches},
			{"grouping", {{"enabled", playlist.Grouped}, {"template", playlist.GroupingTemplate}, {"autoMerge", playlist.GroupAutoMerge}}},
		};
	}

	nlohmann::json ToJson(const player::PlaylistGroup &group)
	{
		return {
			{"index", group.Index},
			{"name", group.Name},
			{"count", group.Count},
			{"enabledCount", group.EnabledCount},
			{"duration", group.Duration},
			{"size", group.Size},
			{"expanded", group.Expanded},
			{"firstPosition", group.FirstPosition},
		};
	}

	nlohmann::json ToJson(const player::TrackInfo &info, const std::string &playlistId, std::uint64_t revision)
	{
		const std::string lastPlayed = DelphiDateTimeToIso8601(info.LastPlayed);
		return {
			{"playlistId", playlistId},
			{"revision", revision},
			{"index", info.Index},
			{"fileUri", info.FileUri},
			{"fileName", info.FileName},
			{"isUrl", info.IsUrl},
			{"inContainer", info.InContainer},
			{"cover", player::CoverKey(info.Cover)},
			{"title", info.Title},
			{"artist", info.Artist},
			{"album", info.Album},
			{"albumArtist", info.AlbumArtist},
			{"genre", info.Genre},
			{"year", info.Year},
			{"trackNumber", info.TrackNumber},
			{"lyricist", info.Lyricist},
			{"format", info.Format},
			{"sampleRate", info.SampleRate},
			{"bitrate", info.Bitrate},
			{"bitDepth", info.BitDepth},
			{"channels", info.Channels},
			{"duration", info.Duration},
			{"size", info.Size},
			{"playCount", info.PlayCount},
			{"lastPlayed", lastPlayed.empty() ? nlohmann::json() : nlohmann::json(lastPlayed)},
		};
	}

	nlohmann::json ApplyGroupPatch(IAIMPCore *core, StateUpdateEvents &events, const ApiRequest &request,
								   const std::string &playlistId, std::optional<std::int32_t> index)
	{
		const nlohmann::json &body = request.Body;
		if (!body.is_object() || !body.contains("expanded") || !body["expanded"].is_boolean())
			throw ApiError(400, "invalidBody");
		CheckRevision(body, events, playlistId);
		const bool expanded = body["expanded"].get<bool>();
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::SetGroupExpanded(core, playlistId, index, expanded); }));
		return nlohmann::json::object();
	}

	player::SortOptions SortBody(const nlohmann::json &body)
	{
		using player::SortMode;
		static const std::pair<const char *, SortMode> modes[] = {
			{"title", SortMode::Title},
			{"fileName", SortMode::FileName},
			{"duration", SortMode::Duration},
			{"artist", SortMode::Artist},
			{"inverse", SortMode::Inverse},
			{"random", SortMode::Random},
			{"randomGroups", SortMode::RandomGroups},
			{"randomGroupItems", SortMode::RandomGroupItems},
			{"randomAll", SortMode::RandomAll},
			{"template", SortMode::Template},
		};
		if (!body.is_object() || !body.contains("by") || !body["by"].is_string())
			throw ApiError(400, "invalidBody");
		const std::string by = body["by"].get<std::string>();
		const auto mode = std::find_if(std::begin(modes), std::end(modes), [&](const auto &entry)
									   { return by == entry.first; });
		if (mode == std::end(modes))
			throw ApiError(400, "invalidBody");

		player::SortOptions options;
		options.Mode = mode->second;
		options.Descending = OptionalField<bool>(body, "descending", &nlohmann::json::is_boolean).value_or(false);
		if (options.Mode == SortMode::Template)
		{
			if (!body.contains("template") || !body["template"].is_string() || body["template"].get<std::string>().empty())
				throw ApiError(400, "invalidBody");
			options.Template = body["template"].get<std::string>();
		}
		return options;
	}
}

void webapi::PlaylistsController::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapApi(HttpMethod::Get, "/api/v1/playlists", [core = FCore, &events = FEvents](const ApiRequest &) -> nlohmann::json
			   {
		const std::vector<player::PlaylistInfo> playlists = RunOnMainThread(core, [&]
																			 { return player::GetPlaylists(core); });
		const StateUpdateEvents::PlaylistRevisions revisions = events.CurrentPlaylistRevisions();
		nlohmann::json result = nlohmann::json::array();
		for (const player::PlaylistInfo &playlist : playlists)
			result.push_back(ToJson(playlist, RevisionOf(revisions, playlist.Id)));
		return result; });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/playlists", [core = FCore](const ApiRequest &request) -> nlohmann::json
			   {
		const nlohmann::json &body = request.Body;
		if (!body.is_null() && !body.is_object())
			throw ApiError(400, "invalidBody");
		const std::string name = body.is_null() ? std::string() : OptionalField<std::string>(body, "name", &nlohmann::json::is_string).value_or(std::string());
		const std::string id = RunOnMainThread(core, [&]
												{ return player::CreatePlaylist(core, name); });
		if (id.empty())
			throw ApiError(500, "playlistUpdateFailed");
		return {{"id", id}}; });

	endpoints.MapApi(HttpMethod::Patch, R"(/api/v1/playlists/([^/]+))", [core = FCore](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const nlohmann::json &body = request.Body;
		if (!body.is_object() || !body.contains("name") || !body["name"].is_string())
			throw ApiError(400, "invalidBody");
		const std::string name = body["name"].get<std::string>();
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::RenamePlaylist(core, playlistId, name); }));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Delete, R"(/api/v1/playlists/([^/]+))", [core = FCore](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::RemovePlaylist(core, playlistId); }));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Post, R"(/api/v1/playlists/([^/]+)/items)", [core = FCore, &settings = FSettings](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const nlohmann::json &body = request.Body;
		if (!body.is_object())
			throw ApiError(400, "invalidBody");
		std::vector<std::string> uris = StringArray(body, "files", false);
		const std::vector<std::string> urls = StringArray(body, "urls", false);
		if (uris.empty() && urls.empty())
			throw ApiError(400, "invalidBody");
		for (const std::string &file : uris)
			if (file.empty())
				throw ApiError(400, "invalidBody");
		for (const std::string &url : urls)
			if (!IsUrl(url))
				throw ApiError(400, "invalidBody");
		if (!uris.empty() && !settings.Get().Features.BrowseFiles)
			throw ApiError(403, "browseFilesDisabled");
		uris.insert(uris.end(), urls.begin(), urls.end());
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::AddFiles(core, playlistId, uris); }));
		return nlohmann::json::object(); });

	endpoints.MapApiUpload(R"(/api/v1/playlists/([^/]+)/upload)", [core = FCore, &settings = FSettings](const ApiRequest &request, IUploadBody &body) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const Settings::FeatureSettings features = settings.Get().Features;
		if (!features.UploadTracks)
			throw ApiError(403, "uploadDisabled");
		// Nothing is read or written for a playlist that cannot take the files.
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  {
			IAIMPPlaylist *playlist = nullptr;
			const player::MutationResult writable = player::OpenWritablePlaylist(core, playlistId, playlist);
			if (playlist)
				playlist->Release();
			return writable; }));
		player::UploadWriter writer(features.EffectiveUploadFolder());
		if (!writer.HasRoomFor(body.DeclaredSize()))
			throw ApiError(507, "uploadNoSpace");
		const bool whole = body.ReadFiles([&](const UploadPart &part)
										  { return writer.Begin(part.FileName); },
										  [&](const char *data, std::size_t size)
										  { return writer.Write(data, size); });
		const player::SavedUploads saved = writer.Finish();
		if (saved.Failure == player::UploadFailure::NoSpace)
			throw ApiError(507, "uploadNoSpace");
		if (saved.Failure != player::UploadFailure::None)
			throw ApiError(500, "uploadFailed");
		if (!whole || saved.Paths.empty())
		{
			writer.Abandon();
			throw ApiError(400, "invalidBody");
		}
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::AddFiles(core, playlistId, saved.Paths); }));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Get, R"(/api/v1/playlists/([^/]+)/items)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		player::ItemsQuery query;
		query.Offset = QueryInt(request, "offset", 0, 0, INT32_MAX);
		query.Limit = QueryInt(request, "limit", DefaultPageLimit, 1, MaxPageLimit);
		query.Search = SearchText(request);

		// The revision is read before the items so that a change racing with the read
		// makes the page look older, never newer, than it is.
		const std::uint64_t revision = events.PlaylistRevision(playlistId);
		const std::optional<player::ItemsPage> page = RunOnMainThread(core, [&]
																	   { return player::GetPlaylistItems(core, playlistId, query); });
		if (!page)
			throw ApiError(404, "playlistNotFound");

		nlohmann::json items = nlohmann::json::array();
		for (const player::PlaylistItem &item : page->Items)
			items.push_back(ItemJson(item));
		nlohmann::json result = {
			{"total", page->Total},
			{"revision", revision},
			{"offset", page->Offset},
			{"items", std::move(items)},
		};
		if (page->Matches)
		{
			result["duration"] = page->Matches->Duration;
			result["size"] = page->Matches->Size;
		}
		return result; });

	// No revision check on an item's own properties: changes made in quick
	// succession must all count, and each of them changes the playlist.
	endpoints.MapApi(HttpMethod::Patch, R"(/api/v1/playlists/([^/]+)/items/(\d+)/mark)", [core = FCore](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const std::int32_t index = PathNumber(request, 1, "itemNotFound");
		const nlohmann::json &body = request.Body;
		if (!body.is_object() || !body.contains("mark") || !body["mark"].is_number_unsigned() || body["mark"].get<std::int32_t>() > 5)
			throw ApiError(400, "invalidBody");
		const std::int32_t mark = body["mark"].get<std::int32_t>();
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::SetItemMark(core, playlistId, index, mark); }));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Patch, R"(/api/v1/playlists/([^/]+)/items/(\d+)/enabled)", [core = FCore](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const std::int32_t index = PathNumber(request, 1, "itemNotFound");
		const bool enabled = EnabledBody(request.Body);
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::SetItemEnabled(core, playlistId, index, enabled); }));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Post, R"(/api/v1/playlists/([^/]+)/items/enabled)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const player::ItemSelection selection = SelectionBody(request.Body);
		const bool enabled = EnabledBody(request.Body);
		CheckRevision(request.Body, events, playlistId);
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::SetItemsEnabled(core, playlistId, selection, enabled); }));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Post, R"(/api/v1/playlists/([^/]+)/items/details)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const player::ItemSelection selection = SelectionBody(request.Body);
		CheckRevision(request.Body, events, playlistId);
		std::vector<player::ItemDetails> details;
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::DescribePlaylistItems(core, playlistId, selection, details); }));
		nlohmann::json items = nlohmann::json::array();
		for (const player::ItemDetails &item : details)
			items.push_back(DetailsJson(item));
		return {{"items", std::move(items)}}; });

	// By the URI rather than the index: the information belongs to the file, and a
	// screen that shows it outlives the revision it was opened at.
	endpoints.MapApi(HttpMethod::Get, R"(/api/v1/playlists/([^/]+)/items/info)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const std::string fileUri = QueryString(request, "uri");
		if (fileUri.empty())
			throw ApiError(400, "invalidQuery");
		const std::uint64_t revision = events.PlaylistRevision(playlistId);
		player::TrackInfo info;
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::ReadTrackInfo(core, playlistId, fileUri, info); }));
		return ToJson(info, playlistId, revision); });

	// The lookup waits for the player's providers, so it stays on the request's thread.
	endpoints.MapApi(HttpMethod::Get, R"(/api/v1/playlists/([^/]+)/items/lyrics)", [core = FCore](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string fileUri = QueryString(request, "uri");
		if (fileUri.empty())
			throw ApiError(400, "invalidQuery");
		player::Lyrics lyrics;
		ThrowUnlessOk(player::ReadLyrics(core, request.PathMatches.at(0), fileUri, lyrics));
		return ToJson(lyrics); });

	// Only the files of the playlist's items, never a path from the request.
	endpoints.MapGet(R"(/api/v1/playlists/([^/]+)/items/file)", [core = FCore, &settings = FSettings](const ApiRequest &request) -> std::optional<HttpContent>
			   {
		if (!settings.Get().Features.DownloadTracks)
			throw ApiError(403, "downloadDisabled");
		const std::string fileUri = QueryString(request, "uri");
		if (fileUri.empty())
			throw ApiError(400, "invalidQuery");
		std::string file;
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::FindTrackFile(core, request.PathMatches.at(0), fileUri, file); }));
		const std::filesystem::path path = PathFromUtf8(file);
		std::error_code ec;
		if (!std::filesystem::is_regular_file(path, ec))
			throw ApiError(404, "fileNotFound");
		HttpContent content;
		content.ContentType = player::AudioContentType(path);
		content.FilePath = file;
		content.Headers["Content-Disposition"] = webapi::AttachmentContentDisposition(PathToUtf8(path.filename()));
		return content; });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/playlists/locate", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const nlohmann::json &body = request.Body;
		if (!body.is_object() || !body.contains("items") || !body["items"].is_array())
			throw ApiError(400, "invalidBody");
		std::vector<player::LocateRequest> requests;
		for (const nlohmann::json &entry : body["items"])
		{
			if (!entry.is_object())
				throw ApiError(400, "invalidBody");
			const auto fileUri = OptionalField<std::string>(entry, "fileUri", &nlohmann::json::is_string);
			const auto playlistId = OptionalField<std::string>(entry, "playlistId", &nlohmann::json::is_string);
			if (!fileUri || !playlistId)
				throw ApiError(400, "invalidBody");
			requests.push_back({*fileUri, *playlistId});
		}

		const StateUpdateEvents::PlaylistRevisions revisions = events.CurrentPlaylistRevisions();
		const std::vector<player::LocatedItem> located = RunOnMainThread(core, [&]
																		  { return player::LocatePlaylistItems(core, requests); });
		nlohmann::json found = nlohmann::json::array();
		for (const player::LocatedItem &entry : located)
			found.push_back(ItemJson(entry.Item, entry.PlaylistId, RevisionOf(revisions, entry.PlaylistId)));
		return {{"found", std::move(found)}}; });

	endpoints.MapApi(HttpMethod::Get, R"(/api/v1/playlists/([^/]+)/groups)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const std::uint64_t revision = events.PlaylistRevision(playlistId);
		const std::string search = SearchText(request);
		const std::optional<std::vector<player::PlaylistGroup>> groups = RunOnMainThread(core, [&]
																				   { return player::GetPlaylistGroups(core, playlistId, search); });
		if (!groups)
			throw ApiError(404, "playlistNotFound");

		nlohmann::json result = nlohmann::json::array();
		for (const player::PlaylistGroup &group : *groups)
			result.push_back(ToJson(group));
		return {{"revision", revision}, {"groups", std::move(result)}}; });

	endpoints.MapApi(HttpMethod::Patch, R"(/api/v1/playlists/([^/]+)/groups)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   { return ApplyGroupPatch(core, events, request, request.PathMatches.at(0), std::nullopt); });

	endpoints.MapApi(HttpMethod::Patch, R"(/api/v1/playlists/([^/]+)/groups/(\d+))", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   { return ApplyGroupPatch(core, events, request, request.PathMatches.at(0), PathNumber(request, 1, "groupNotFound")); });

	endpoints.MapApi(HttpMethod::Post, R"(/api/v1/playlists/([^/]+)/sort)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const player::SortOptions options = SortBody(request.Body);
		CheckRevision(request.Body, events, playlistId);
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::SortPlaylist(core, playlistId, options); }));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Post, R"(/api/v1/playlists/([^/]+)/items/move)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const auto move = MoveBody(request.Body, "indexes");
		CheckRevision(request.Body, events, playlistId);
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::MovePlaylistItems(core, playlistId, move.first, move.second); }));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Post, R"(/api/v1/playlists/([^/]+)/items/remove)", [core = FCore, &events = FEvents, &settings = FSettings](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const player::ItemSelection selection = SelectionBody(request.Body);
		const bool physically = OptionalField<bool>(request.Body, "physically", &nlohmann::json::is_boolean).value_or(false);
		if (physically && !settings.Get().Features.PhysicalDeletion)
			throw ApiError(403, "physicalDeletionDisabled");
		CheckRevision(request.Body, events, playlistId);
		std::vector<std::string> undeletable;
		const player::MutationResult result = RunOnMainThread(core, [&]
															  { return player::RemovePlaylistItems(core, playlistId, selection, physically, undeletable); });
		if (result == player::MutationResult::FilesNotDeletable)
			throw ApiError(403, "filesNotDeletable", {{"files", undeletable}});
		ThrowUnlessOk(result);
		return nlohmann::json::object(); });
}
