export default {
  activate(context) {
    context.ui.panels.register({
      id: "custom-settings",
      title: "Custom settings",
      purpose: "settings",
      mount() {},
    });
  },
};
