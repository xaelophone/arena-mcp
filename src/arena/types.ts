export const SEARCH_TYPE_VALUES = [
  "All",
  "Text",
  "Image",
  "Link",
  "Attachment",
  "Embed",
  "Channel",
  "Block",
  "User",
  "Group",
] as const;
export type SearchType = (typeof SEARCH_TYPE_VALUES)[number];

export const SEARCH_SCOPE_VALUES = ["all", "my", "following"] as const;
export type SearchScope = (typeof SEARCH_SCOPE_VALUES)[number];

export const SEARCH_SORT_VALUES = [
  "score_desc",
  "created_at_desc",
  "created_at_asc",
  "updated_at_desc",
  "updated_at_asc",
  "name_asc",
  "name_desc",
  "connections_count_desc",
  "random",
] as const;
export type SearchSort = (typeof SEARCH_SORT_VALUES)[number];

export const CONTENT_TYPE_FILTER_VALUES = [
  "Text",
  "Image",
  "Link",
  "Attachment",
  "Embed",
  "Channel",
  "Block",
] as const;
export type ContentTypeFilter = (typeof CONTENT_TYPE_FILTER_VALUES)[number];

export const CONTENT_SORT_VALUES = [
  "created_at_desc",
  "created_at_asc",
  "updated_at_desc",
  "updated_at_asc",
] as const;
export type ContentSort = (typeof CONTENT_SORT_VALUES)[number];

export const CHANNEL_CONTENT_SORT_VALUES = [
  "position_asc",
  "position_desc",
  "created_at_desc",
  "created_at_asc",
  "updated_at_desc",
  "updated_at_asc",
] as const;
export type ChannelContentSort = (typeof CHANNEL_CONTENT_SORT_VALUES)[number];

export const CONNECTION_SORT_VALUES = ["created_at_desc", "created_at_asc"] as const;
export type ConnectionSort = (typeof CONNECTION_SORT_VALUES)[number];

export const CONNECTION_FILTER_VALUES = ["ALL", "OWN", "EXCLUDE_OWN"] as const;
export type ConnectionFilter = (typeof CONNECTION_FILTER_VALUES)[number];

export const CHANNEL_VISIBILITY_VALUES = ["public", "private", "closed"] as const;
export type ChannelVisibility = (typeof CHANNEL_VISIBILITY_VALUES)[number];

export const MOVE_CONNECTION_VALUES = [
  "insert_at",
  "move_to_top",
  "move_to_bottom",
  "move_up",
  "move_down",
] as const;
export type MoveConnectionMovement = (typeof MOVE_CONNECTION_VALUES)[number];

export type ArenaSourceApi = "v3" | "v2-fallback";
export type BlockType = "Text" | "Image" | "Link" | "Attachment" | "Embed" | "PendingBlock";
export type ConnectableType = BlockType | "Channel";

export interface PaginationMeta {
  currentPage: number;
  nextPage: number | null;
  prevPage: number | null;
  perPage: number;
  totalPages: number;
  totalCount: number;
  hasMorePages: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface NormalizedMarkdown {
  markdown: string;
  html: string;
  plain: string;
}

export interface NormalizedEmbeddedUser {
  id: number;
  slug: string;
  name: string;
  avatar: string | null;
  initials: string | null;
}

export interface NormalizedConnectionContext {
  id: number;
  position: number | null;
  pinned: boolean | null;
  connectedAt: string | null;
  connectedBy: NormalizedEmbeddedUser | null;
}

export interface NormalizedChannelCounts {
  blocks: number;
  channels: number;
  contents: number;
  collaborators: number;
}

export interface NormalizedUserCounts {
  channels?: number;
  following?: number;
  followers?: number;
  blocks?: number;
}

export interface NormalizedChannel {
  type: "Channel";
  id: number;
  slug: string;
  title: string;
  description: NormalizedMarkdown | null;
  state: string | null;
  visibility: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  owner: NormalizedEmbeddedUser | null;
  counts: NormalizedChannelCounts | null;
  connection: NormalizedConnectionContext | null;
}

export interface NormalizedImage {
  src: string | null;
  small: string | null;
  medium: string | null;
  large: string | null;
  square: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  contentType: string | null;
  filename: string | null;
  fileSize: number | null;
}

export interface NormalizedAttachment {
  url: string;
  filename: string | null;
  contentType: string | null;
  fileSize: number | null;
  fileExtension: string | null;
}

export interface NormalizedEmbed {
  url: string | null;
  sourceUrl: string | null;
  html: string | null;
  title: string | null;
  type: string | null;
  authorName: string | null;
}

export interface NormalizedBlock {
  type: BlockType;
  id: number;
  title: string | null;
  description: NormalizedMarkdown | null;
  state: string | null;
  visibility: string | null;
  commentCount: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  user: NormalizedEmbeddedUser | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  content: NormalizedMarkdown | null;
  image: NormalizedImage | null;
  attachment: NormalizedAttachment | null;
  embed: NormalizedEmbed | null;
  connection: NormalizedConnectionContext | null;
}

export type NormalizedConnectable = NormalizedBlock | NormalizedChannel;

export interface NormalizedUser {
  id: number;
  slug: string;
  name: string;
  avatar: string | null;
  initials: string | null;
  bio: NormalizedMarkdown | null;
  createdAt: string | null;
  updatedAt: string | null;
  counts: NormalizedUserCounts | null;
}

export interface NormalizedSearchItem {
  id: number;
  entityType: "Block" | "Channel" | "User" | "Group";
  title: string;
  subtitle: string | null;
  slug: string | null;
  blockType: BlockType | null;
  url: string | null;
  raw: unknown;
}

export interface NormalizedSearchResult {
  sourceApi: ArenaSourceApi;
  items: NormalizedSearchItem[];
  meta: PaginationMeta;
}

export interface SearchParams {
  query: string;
  type?: SearchType;
  scope?: SearchScope;
  page?: number;
  per?: number;
  sort?: SearchSort;
  after?: string;
  seed?: number;
  user_id?: number;
  group_id?: number;
  channel_id?: number;
  ext?: string[];
}

export interface ChannelContentsParams {
  idOrSlug: string;
  page?: number;
  per?: number;
  sort?: ChannelContentSort;
  user_id?: number;
}

export interface BlockConnectionsParams {
  id: number;
  page?: number;
  per?: number;
  sort?: ConnectionSort;
  filter?: ConnectionFilter;
}

export interface UserContentsParams {
  idOrSlug: string;
  page?: number;
  per?: number;
  sort?: ContentSort;
  type?: ContentTypeFilter;
}

export interface CreateChannelInput {
  title: string;
  visibility?: ChannelVisibility;
  description?: string;
  group_id?: number;
}

export interface CreateBlockInput {
  value: string;
  channel_ids: number[];
  title?: string;
  description?: string;
  original_source_url?: string;
  original_source_title?: string;
  alt_text?: string;
  insert_at?: number;
}

export interface ConnectBlockInput {
  block_id: number;
  channel_ids: number[];
  position?: number;
}

export interface MoveConnectionInput {
  connection_id: number;
  movement: MoveConnectionMovement;
  position?: number;
}
