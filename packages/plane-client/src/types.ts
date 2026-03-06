export type PlaneConfig = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly workspaceSlug: string;
};

export type PlaneProject = {
  id: string;
  name: string;
  identifier: string;
};

export type PlaneState = {
  id: string;
  name: string;
  group: string;
};

export type PlaneIssue = {
  id: string;
  name: string;
  priority: string;
  state: string;
  sequence_id: number;
  description_html?: string | null;
  description?: string;
  created_at?: string;
  updated_at?: string;
  project?: string;
  labels?: string[];
};

export type PlaneLabel = {
  id: string;
  name: string;
  color?: string;
  description?: string;
};

export type PlaneComment = {
  id: string;
  comment_html: string;
  created_at: string;
  updated_at?: string;
  created_by?: string;
  actor_detail?: {
    first_name: string;
    last_name: string;
    display_name: string;
  };
};

export type PlaneLink = {
  id: string;
  title: string;
  url: string;
};
