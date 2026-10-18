---
name: blueprint
description: Instructions how to use blueprint v6 - use with /admin view links, it will not be used on the frontend. all other / links
license: GPL-2.0-only
metadata:
  author: stopsopa
  version: "1.0"
---

Generally in this project for page in /admin we will use blueprintjs v6 components. from https://blueprintjs.com/docs/.

<icons>

I will be using icons in one of few available ways. Since I prefer simplicity and explicitness I will use them as follow:

(from documentation page: https://blueprintjs.com/docs/#icons/loading-icons)

```


Using static imports
Blueprint's icon prop APIs accept a JSX element. When you use this type, you are expected to supply an SVG React element imported from the icons package.

import { Button } from "@blueprintjs/core";
import { DownloadIcon } from "@blueprintjs/icons";
import * as React from "react";
import * as ReactDOM from "react-dom/client";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(<Button text="Download" icon={<DownloadIcon size={16} />} />);
This approach has benefits and tradeoffs:

Bundling only the icons you need is trivial with a properly-configured bundler which supports tree-shaking.
You do have to explicitly import each icon you use as an ES import.
You do have to take care to specify the correct icon size (if it is not the default 16px size) depending on the usage context.
@blueprintjs/icons now prefers static component names with an Icon suffix (for example DownloadIcon). Legacy unsuffixed exports (for example Download) remain available temporarily for backward compatibility, but are deprecated and planned for removal in the next major release.

```

I have already loaded default css

@import "@blueprintjs/icons/lib/css/blueprint-icons.css"; in src/index.css

</icons>
