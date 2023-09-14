import * as TabsPrimitive from "@radix-ui/react-tabs";
import React from "react";
import classNames from "classnames";

type TabsTriggerElement = React.ElementRef<typeof TabsPrimitive.Trigger>;
interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {}

export const TabsTrigger = React.forwardRef<
  TabsTriggerElement,
  TabsTriggerProps
>((props, forwardedRef) => {
  const { className, children, ...triggerProps } = props;
  return (
    <TabsPrimitive.Trigger
      {...triggerProps}
      ref={forwardedRef}
      className={classNames("rt-reset-button", "rt-TabsTrigger", className)}
    >
      <span className="rt-TabsTriggerInner space-x-2">{children}</span>
      <span className="rt-TabsTriggerInnerHidden">{children}</span>
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = "TabsTrigger";
