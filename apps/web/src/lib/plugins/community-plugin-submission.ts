import { isReservedMarketplacePluginId } from "@edgeever/plugin-api";
import { downloadGithubExtension, parseGithubRepositoryUrl } from "@/lib/plugins/github-plugin-distribution";

export const COMMUNITY_PLUGINS_REPOSITORY_URL = "https://github.com/tianma-if/edgeever-plugins";
export const COMMUNITY_PLUGINS_README_URL = `${COMMUNITY_PLUGINS_REPOSITORY_URL}#readme`;

export const communityPluginSubmissionIssueUrl = (pluginId: string, repositoryUrl: string) => {
  const url = new URL(`${COMMUNITY_PLUGINS_REPOSITORY_URL}/issues/new`);
  url.searchParams.set("template", "plugin-submission.yml");
  url.searchParams.set("title", `Plugin ${pluginId}`);
  url.searchParams.set("plugin_id", pluginId);
  url.searchParams.set("repository_url", repositoryUrl);
  return url.href;
};

export const precheckCommunityPluginSubmission = async (input: string) => {
  const coordinates = parseGithubRepositoryUrl(input);
  if (!coordinates) {
    throw new Error("Enter a public GitHub repository URL such as https://github.com/owner/repository.");
  }
  const downloaded = await downloadGithubExtension(coordinates.repositoryUrl);
  if (isReservedMarketplacePluginId(downloaded.manifest.id)) {
    throw new Error("Plugin ids under org.edgeever are reserved for EdgeEver.");
  }
  if (!downloaded.checksums.manifestJson) throw new Error("The GitHub release is missing manifest.json.");
  if (downloaded.manifest.type === "plugin" && !downloaded.checksums.mainJs) {
    throw new Error("The GitHub release is missing main.js.");
  }
  return {
    id: downloaded.manifest.id,
    version: downloaded.manifest.version,
    repositoryUrl: downloaded.repositoryUrl,
    releaseTag: downloaded.releaseTag,
  };
};
