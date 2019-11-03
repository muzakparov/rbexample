import classNames from "classnames";
import styles from "dom-helpers/css";
import transitionEnd from "dom-helpers/transitionEnd";
import PropTypes from "prop-types";

import { useBootstrapPrefix } from "./ThemeProvider";
import { useUncontrolled } from "uncontrollable";

import React, { cloneElement, useState } from "react";
import { uncontrollable } from "uncontrollable";
import CarouselCaption from "./CarouselCaption";
import CarouselItem from "./CarouselItem";
import { forEach, map } from "./ElementChildren";
import SafeAnchor from "./SafeAnchor";
import { createBootstrapComponent } from "./ThemeProvider";
import triggerBrowserReflow from "./triggerBrowserReflow";

const countChildren = c =>
  React.Children.toArray(c).filter(React.isValidElement).length;

const SWIPE_THRESHOLD = 40;

// TODO: `slide` should be `animate`.

const propTypes = {
  /**
   * @default 'carousel'
   */
  bsPrefix: PropTypes.string,
  as: PropTypes.elementType,

  /**
   * Enables animation on the Carousel as it transitions between slides.
   */
  slide: PropTypes.bool,

  /** Cross fade slides instead of the default slide animation */
  fade: PropTypes.bool,

  /** Slides will loop to the start when the last one transitions */
  wrap: PropTypes.bool,

  /**
   * Show a set of slide position indicators
   */
  indicators: PropTypes.bool,

  /**
   * The amount of time to delay between automatically cycling an item.
   * If `null`, carousel will not automatically cycle.
   */
  interval: PropTypes.number,

  /**
   * Show the Carousel previous and next arrows for changing the current slide
   */
  controls: PropTypes.bool,

  /**
   * Temporarily pause the slide interval when the mouse hovers over a slide.
   */
  pauseOnHover: PropTypes.bool,

  /** Enable keyboard navigation via the Arrow keys for changing slides */
  keyboard: PropTypes.bool,

  /**
   * Callback fired when the active item changes.
   *
   * ```js
   * (eventKey: any, direction: 'prev' | 'next', ?event: Object) => any
   * ```
   *
   * @controllable activeIndex
   */
  onSelect: PropTypes.func,

  /** A callback fired after a slide transitions in */
  onSlideEnd: PropTypes.func,

  /**
   * Controls the current visible slide
   *
   * @controllable onSelect
   */
  activeIndex: PropTypes.number,

  /** Override the default button icon for the "previous" control */
  prevIcon: PropTypes.node,

  /**
   * Label shown to screen readers only, can be used to show the previous element
   * in the carousel.
   * Set to null to deactivate.
   */
  prevLabel: PropTypes.string,

  /** Override the default button icon for the "next" control */
  nextIcon: PropTypes.node,

  /**
   * Label shown to screen readers only, can be used to show the next element
   * in the carousel.
   * Set to null to deactivate.
   */
  nextLabel: PropTypes.string,

  /**
   * Whether the carousel should support left/right swipe interactions on touchscreen devices.
   */
  touch: PropTypes.bool
};

const defaultProps = {
  slide: true,
  fade: false,
  interval: 1000,
  keyboard: true,
  pauseOnHover: true,
  wrap: true,
  indicators: true,
  controls: true,
  activeIndex: 0,

  prevIcon: <span aria-hidden="true" className="carousel-control-prev-icon" />,
  prevLabel: "Previous",

  nextIcon: <span aria-hidden="true" className="carousel-control-next-icon" />,
  nextLabel: "Next",
  touch: true
};

class Carousel extends React.Component {
  state = {
    prevClasses: "",
    currentClasses: "active",
    touchStartX: 0
  };

  isUnmounted = false;

  carousel = React.createRef();

  componentDidMount() {
    console.log("componentDidMount");

    this.cycle();
  }

  static getDerivedStateFromProps(
    nextProps,
    { activeIndex: previousActiveIndex }
  ) {
    if (nextProps.activeIndex !== previousActiveIndex) {
      const lastPossibleIndex = countChildren(nextProps.children) - 1;

      const nextIndex = Math.max(
        0,
        Math.min(nextProps.activeIndex, lastPossibleIndex)
      );

      let direction;
      if (
        (nextIndex === 0 && previousActiveIndex >= lastPossibleIndex) ||
        previousActiveIndex <= nextIndex
      ) {
        direction = "next";
      } else {
        direction = "prev";
      }

      return {
        direction,
        previousActiveIndex,
        activeIndex: nextIndex
      };
    }
    return null;
  }

  componentDidUpdate(_, prevState) {
    console.log("componentDidUpdate");

    const { bsPrefix, slide, onSlideEnd } = this.props;
    if (
      !slide ||
      this.state.activeIndex === prevState.activeIndex ||
      this._isSliding
    )
      return;

    const { activeIndex, direction } = this.state;
    let orderClassName, directionalClassName;

    if (direction === "next") {
      orderClassName = `${bsPrefix}-item-next`;
      directionalClassName = `${bsPrefix}-item-left`;
    } else if (direction === "prev") {
      orderClassName = `${bsPrefix}-item-prev`;
      directionalClassName = `${bsPrefix}-item-right`;
    }

    this._isSliding = true;

    this.pause();

    // eslint-disable-next-line react/no-did-update-set-state
    this.safeSetState(
      { prevClasses: "active", currentClasses: orderClassName },
      () => {
        const items = this.carousel.current.children;
        const nextElement = items[activeIndex];
        triggerBrowserReflow(nextElement);

        this.safeSetState(
          {
            prevClasses: classNames("active", directionalClassName),
            currentClasses: classNames(orderClassName, directionalClassName)
          },
          () =>
            transitionEnd(nextElement, () => {
              this.safeSetState(
                { prevClasses: "", currentClasses: "active" },
                this.handleSlideEnd
              );
              if (onSlideEnd) {
                onSlideEnd();
              }
            })
        );
      }
    );
  }

  componentWillUnmount() {
    clearTimeout(this.timeout);
    this.isUnmounted = true;
  }

  handleSlideEnd = () => {
    const pendingIndex = this._pendingIndex;
    this._isSliding = false;
    this._pendingIndex = null;

    if (pendingIndex != null) this.to(pendingIndex);
    else this.cycle();
  };

  handleMouseOut = () => {
    this.cycle();
  };

  handleMouseOver = () => {
    if (this.props.pauseOnHover) this.pause();
  };

  handleNextWhenVisible = () => {
    if (
      !this.isUnmounted &&
      !document.hidden &&
      styles(this.carousel.current, "visibility") !== "hidden"
    ) {
      this.handleNext();
    }
  };

  handleNext = e => {
    if (this._isSliding) return;

    const { wrap, activeIndex } = this.props;

    let index = activeIndex + 1;
    const count = countChildren(this.props.children);

    if (index > count - 1) {
      if (!wrap) return;

      index = 0;
    }

    this.select(index, e, "next");
  };

  safeSetState(state, cb) {
    if (this.isUnmounted) return;
    this.setState(state, () => !this.isUnmounted && cb());
  }

  // This might be a public API.
  pause() {
    this._isPaused = true;
    clearInterval(this._interval);
    this._interval = null;
  }

  cycle() {
    this._isPaused = false;

    clearInterval(this._interval);
    this._interval = null;

    if (this.props.interval && !this._isPaused) {
      this._interval = setInterval(
        document.visibilityState ? this.handleNextWhenVisible : this.handleNext,
        this.props.interval
      );
    }
  }

  select(index, event, direction) {
    const { activeIndex, onSelect } = this.props;
    onSelect(
      index,
      direction || (index < activeIndex ? "prev" : "next"),
      event
    );
  }

  render() {
    const {
      // Need to define the default "as" during prop destructuring to be compatible with styled-components github.com/react-bootstrap/react-bootstrap/issues/3595
      as: Component = "div",
      bsPrefix,
      slide,
      fade,
      indicators,
      controls,
      wrap,
      touch,
      prevIcon,
      prevLabel,
      nextIcon,
      nextLabel,
      className,
      children,
      keyboard,
      activeIndex: _5,
      pauseOnHover: _4,
      interval: _3,
      onSelect: _2,
      onSlideEnd: _1,
      ...props
    } = this.props;

    const {
      activeIndex,
      previousActiveIndex,
      prevClasses,
      currentClasses
    } = this.state;

    console.log("bsPrefix", this.state);

    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <Component
        {...props}
        className={classNames(
          className,
          bsPrefix,
          slide && "slide",
          fade && `${bsPrefix}-fade`
        )}
        onMouseOver={this.handleMouseOver}
        onMouseOut={this.handleMouseOut}
      >
        <div className={`${bsPrefix}-inner`} ref={this.carousel}>
          {map(children, (child, index) => {
            const current = index === activeIndex;
            const previous = index === previousActiveIndex;

            return cloneElement(child, {
              className: classNames(
                child.props.className,
                current && currentClasses,
                previous && prevClasses
              )
            });
          })}
        </div>
      </Component>
    );
  }
}

const Carouselhook = React.forwardRef((uncontrolledProps, ref) => {
  const {
    as: Component = "div",
    bsPrefix,
    slide,
    fade,
    indicators,
    controls,
    wrap,
    touch,
    prevIcon,
    prevLabel,
    nextIcon,
    nextLabel,
    className,
    children,
    keyboard,
    activeIndex: activeIndexProp,
    pauseOnHover,
    interval,
    onSelect,
    onSlideEnd,
    ...props
  } = useUncontrolled(uncontrolledProps, { activeIndex: "onSelect" });

  const prefix = useBootstrapPrefix(bsPrefix, "card");

  const [prevClasses, setPrevClasses] = useState("");
  const [currentClasses, setCurrentClasses] = useState("active");
  const [activeIndex, setActiveIndex] = useState(activeIndexProp);

  // prevClasses: '',
  // currentClasses: 'active',
  // touchStartX: 0,
  // activeIndex,
  //       previousActiveIndex,

  // direction,

  // return (
  //   // eslint-disable-next-line jsx-a11y/no-static-element-interactions
  //   <Component
  //     onTouchStart={touch ? this.handleTouchStart : undefined}
  //     onTouchEnd={touch ? this.handleTouchEnd : undefined}
  //     {...props}
  //     className={classNames(
  //       className,
  //       bsPrefix,
  //       slide && "slide",
  //       fade && `${bsPrefix}-fade`
  //     )}
  //     onKeyDown={keyboard ? this.handleKeyDown : undefined}
  //     onMouseOver={this.handleMouseOver}
  //     onMouseOut={this.handleMouseOut}
  //   >
  //     {indicators && this.renderIndicators(children, activeIndex)}

  //     <div className={`${bsPrefix}-inner`} ref={this.carousel}>
  //       {map(children, (child, index) => {
  //         const current = index === activeIndex;
  //         const previous = index === previousActiveIndex;

  //         return cloneElement(child, {
  //           className: classNames(
  //             child.props.className,
  //             current && currentClasses,
  //             previous && prevClasses
  //           )
  //         });
  //       })}
  //     </div>

  //     {controls &&
  //       this.renderControls({
  //         wrap,
  //         children,
  //         activeIndex,
  //         prevIcon,
  //         prevLabel,
  //         nextIcon,
  //         nextLabel
  //       })}
  //   </Component>
  // );
});

Carouselhook.defaultProps = defaultProps;
Carouselhook.propTypes = propTypes;

export { Carouselhook };

//
Carousel.defaultProps = defaultProps;
Carousel.propTypes = propTypes;

const DecoratedCarousel = createBootstrapComponent(
  uncontrollable(Carousel, { activeIndex: "onSelect" }),
  "carousel"
);

DecoratedCarousel.Caption = CarouselCaption;
DecoratedCarousel.Item = CarouselItem;

export default DecoratedCarousel;
