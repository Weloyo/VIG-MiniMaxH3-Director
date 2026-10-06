export function trimPanelSlot(node, data, panelName) {
  const widgets = node && Array.isArray(node.widgets) ? node.widgets : null;
  const values = data && Array.isArray(data.widgets_values) ? data.widgets_values : null;
  if (!widgets || !values || !panelName) return false;
  const last = widgets[widgets.length - 1];
  if (!last || last.name !== panelName) return false;
  const declared = widgets.filter((widget) => widget && widget.name !== panelName).length;
  if (values.length !== declared + 1) return false;
  values.pop();
  return true;
}
export function installPanelSlotTrim(node, panelName, onError) {
  if (!node) return;
  const previous = node.onSerialize;
  node.onSerialize = function (data) {
    if (previous) {
      try {
        previous.call(this, data);
      } catch (err) {
        if (onError) onError(err);
        else console.error("[VIG H3] onSerialize:", err);
      }
    }
    try {
      trimPanelSlot(this, data, panelName);
    } catch (err) {
      if (onError) onError(err);
      else console.error("[VIG H3] trimPanelSlot:", err);
    }
  };
}
