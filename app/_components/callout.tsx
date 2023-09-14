import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  calloutRootPropDefs,
  extractMarginProps,
  GetPropDefTypes,
  IconButton,
  MarginProps,
  PropsWithoutRefOrColor,
  withBreakpoints,
  withMarginProps,
} from "@radix-ui/themes";
import React, { forwardRef } from "react";
import classNames from "classnames";

type CalloutRootOwnProps = GetPropDefTypes<typeof calloutRootPropDefs>;

type CalloutContextValue = CalloutRootOwnProps;
const CalloutContext = React.createContext<CalloutContextValue>({});

type CalloutRootElement = React.ElementRef<"div">;
interface CalloutRootProps
  extends PropsWithoutRefOrColor<"div">,
    MarginProps,
    CalloutContextValue {
  onDismiss?: () => void;
}

// eslint-disable-next-line react/display-name
export const CalloutRoot = forwardRef<CalloutRootElement, CalloutRootProps>(
  (props, forwardedRef) => {
    const { rest: marginRest, ...marginProps } = extractMarginProps(props);
    const {
      children,
      className,
      size = calloutRootPropDefs.size.default,
      variant = calloutRootPropDefs.variant.default,
      color = calloutRootPropDefs.color.default,
      highContrast = calloutRootPropDefs.highContrast.default,
      ...rootProps
    } = marginRest;
    return (
      <div
        data-accent-color={color}
        {...rootProps}
        className={classNames(
          "rt-CalloutRoot",
          className,
          withBreakpoints(size, "rt-r-size"),
          `rt-variant-${variant}`,
          { "rt-high-contrast": highContrast },
          withMarginProps(marginProps),
          // override vertical alignment
          "!items-center",
        )}
        ref={forwardedRef}
      >
        <CalloutContext.Provider
          value={React.useMemo(
            () => ({ size, color, highContrast }),
            [size, color, highContrast],
          )}
        >
          {children}
        </CalloutContext.Provider>

        {props.onDismiss ? (
          <IconButton
            variant={"ghost"}
            className={"!ml-auto"}
            onClick={props.onDismiss}
          >
            <XMarkIcon className={"w-4 h-4"} />
          </IconButton>
        ) : null}
      </div>
    );
  },
);
