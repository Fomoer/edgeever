export default {
  activate(context) {
    const disposeSettings = context.events.on("settings.changed", ({ key }) => {
      globalThis.edgeeverPluginObservedSettings ??= [];
      globalThis.edgeeverPluginObservedSettings.push({ pluginId: context.pluginId, key });
    });
    const disposeNote = context.events.on("note.updated", ({ note }) => {
      globalThis.edgeeverPluginObservedNote = note;
    });
    const disposeTemplate = context.events.on("template.created", ({ template }) => {
      globalThis.edgeeverPluginObservedTemplate = template;
    });
    const disposeResource = context.events.on("resource.updated", ({ resource }) => {
      globalThis.edgeeverPluginObservedResource = resource;
    });
    return () => {
      disposeSettings();
      disposeNote();
      disposeTemplate();
      disposeResource();
    };
  },
};
