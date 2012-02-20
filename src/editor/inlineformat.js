(function($) {

    // Imports ================================================================
    var kendo = window.kendo,
        Class = kendo.Class,
        Editor = kendo.ui.Editor,
        Tool = Editor.Tool,
        dom = Editor.dom,
        RangeUtils = Editor.RangeUtils,
        extend = $.extend;


    var InlineFormatFinder = Class.extend({
        init: function(format) {
            this.format = format;
        },

        numberOfSiblings: function(referenceNode) {
            var textNodesCount = 0,
                elementNodesCount = 0,
                markerCount = 0,
                parentNode = referenceNode.parentNode;

            for (var node = parentNode.firstChild; node; node = node.nextSibling) {
                if (node != referenceNode) {
                    if (node.className == 't-marker') {
                        markerCount++;
                    } else if (node.nodeType == 3) {
                        textNodesCount++;
                    } else {
                        elementNodesCount++;
                    }
                }
            }

            if (markerCount > 1 && parentNode.firstChild.className == 't-marker' && parentNode.lastChild.className == 't-marker') {
                // full node selection
                return 0;
            } else {
                return elementNodesCount + textNodesCount;
            }
        },

        findSuitable: function (sourceNode, skip) {
            if (!skip && this.numberOfSiblings(sourceNode) > 0)
                return null;

            return dom.parentOfType(sourceNode, format[0].tags);
        },

        findFormat: function (sourceNode) {
            var format = this.format,
                attrEquals = dom.attrEquals;
            for (var i = 0; i < format.length; i++) {
                var node = sourceNode;
                var tags = format[i].tags;
                var attributes = format[i].attr;

                if (node && dom.ofType(node, tags) && attrEquals(node, attributes))
                    return node;

                while (node) {
                    node = dom.parentOfType(node, tags);
                    if (node && attrEquals(node, attributes))
                        return node;
                }
            }

            return null;
        },

        isFormatted: function (nodes) {
            for (var i = 0; i < nodes.length; i++)
                if (this.findFormat(nodes[i]))
                    return true;

            return false;
        }
    });

    var InlineFormatter = Class.extend({
        init: function(format, values) {
            this.finder = new InlineFormatFinder(format);
            this.attributes = extend({}, format[0].attr, values);
            this.tag = format[0].tags[0];
        },

        wrap: function(node) {
            return dom.wrap(node, dom.create(node.ownerDocument, this.tag, this.attributes));
        },

        activate: function(range, nodes) {
            if (this.finder.isFormatted(nodes)) {
                this.split(range);
                this.remove(nodes);
            } else
                this.apply(nodes);
        },

        toggle: function (range) {
            var nodes = RangeUtils.textNodes(range);

            if (nodes.length > 0)
                this.activate(range, nodes);
        },

        apply: function (nodes) {
            var formatNodes = [];
            for (var i = 0, l = nodes.length; i < l; i++) {
                var node = nodes[i];

                var formatNode = this.finder.findSuitable(node);
                if (formatNode)
                    dom.attr(formatNode, this.attributes);
                else
                    formatNode = wrap(node);

                formatNodes.push(formatNode);
            }

            this.consolidate(formatNodes);
        },

        remove: function (nodes) {
            for (var i = 0, l = nodes.length; i < l; i++) {
                var formatNode = this.finder.findFormat(nodes[i]);
                if (formatNode) {
                    if (this.attributes && this.attributes.style) {
                        dom.unstyle(formatNode, this.attributes.style);
                        if (!formatNode.style.cssText) {
                            dom.unwrap(formatNode);
                        }
                    } else {
                        dom.unwrap(formatNode);
                    }
                }
            }
        },

        split: function (range) {
            var nodes = RangeUtils.textNodes(range);

            if (nodes.length > 0) {
                for (var i = 0, l = nodes.length; i < l; i++) {
                    var formatNode = this.finder.findFormat(nodes[i]);
                    if (formatNode)
                        RangeUtils.split(range, formatNode, true);
                }
            }
        },

        consolidate: function (nodes) {
            while (nodes.length > 1) {
                var node = nodes.pop();
                var last = nodes[nodes.length - 1];

                if (node.previousSibling && node.previousSibling.className == 't-marker') {
                    last.appendChild(node.previousSibling);
                }

                if (node.tagName == last.tagName && node.previousSibling == last && node.style.cssText == last.style.cssText) {
                    while (node.firstChild)
                        last.appendChild(node.firstChild);
                    dom.remove(node);
                }
            }
        }

    });

    var GreedyInlineFormatFinder = InlineFormatter.extend({
        init: function(format, greedyProperty) {
            var formatter = this;
            formatter.format = format;
            formatter.greedyProperty = greedyProperty;
            InlineFormatFinder.fn.init.call(formatter, format);
        },

        getInlineCssValue: function(node) {
            var attributes = node.attributes,
                trim = $.trim;

            if (!attributes) return;

            for (var i = 0, l = attributes.length; i < l; i++) {
                var attribute = attributes[i],
                    name = attribute.nodeName,
                    attributeValue = attribute.nodeValue;

                if (attribute.specified && name == 'style') {
                
                    var css = trim(attributeValue || node.style.cssText).split(';');

                    for (var cssIndex = 0, len = css.length; cssIndex < len; cssIndex++) {
                        var pair = css[cssIndex];
                        if (pair.length) {
                            var propertyAndValue = pair.split(':');
                            var property = trim(propertyAndValue[0].toLowerCase()),
                                value = trim(propertyAndValue[1]);

                            if (property != this.greedyProperty)
                                continue;

                            return property.indexOf('color') >= 0 ? dom.toHex(value) : value;
                        }
                    }
                }
            }

            return;
        },

        getFormatInner: function (node) {
            var $node = $(dom.isDataNode(node) ? node.parentNode : node);
            var parents = $node.parents().andSelf();

            for (var i = 0, len = parents.length; i < len; i++) {
                var value = this.greedyProperty == 'className' ? parents[i].className : this.getInlineCssValue(parents[i]);
                if (value)
                    return value;
            }

            return 'inherit';
        },

        getFormat: function (nodes) {
            var result = this.getFormatInner(nodes[0]);

            for (var i = 1, len = nodes.length; i < len; i++)
                if (result != getFormatInner(nodes[i]))
                    return '';

            return result;
        },

        isFormatted: function (nodes) {
            return this.getFormat(nodes) !== '';
        }

    });

    var GreedyInlineFormatter = InlineFormatter.extend({
        init: function(format, values, greedyProperty) {
            var formatter = this;

            InlineFormatter.fn.init.call(formatter, format, values);

            this.greedyProperty = greedyProperty;
            this.values = values;
            this.finder = new GreedyInlineFormatFinder(format, greedyProperty)
        },

        activate: function(range, nodes) {
            this.split(range);

            if (this.greedyProperty) {
                var camelCase = this.greedyProperty.replace(/-([a-z])/, function(all, letter){return letter.toUpperCase()});
                this[this.values.style[camelCase] == 'inherit' ? 'remove' : 'apply'](nodes);
            } else {
                this.apply(nodes);
            }
        }
    });

    function inlineFormatWillDelayExecution (range) {
        return range.collapsed && !RangeUtils.isExpandable(range);
    }

    var InlineFormatTool = FormatTool.extend({
        init: function(options) {
            var tool = this;
            FormatTool.fn.init.call(tool, extend(options, {
                finder: new InlineFormatFinder(options.format),
                formatter: function () { return new InlineFormatter(options.format) }
            }));

            this.willDelayExecution = inlineFormatWillDelayExecution;
        }
    });

    var FontTool = Tool.extend({
        init: function(options) {
            var fontTool = this;
            Tool.fn.init.call(fontTool, options);

            // IE has single selection hence we are using select box instead of combobox
            fontTool.options = options;
            fontTool.type = $.browser.msie ? 'tSelectBox' : 'tComboBox';
            fontTool.format = [{ tags: ['span'] }],
            fontTool.finder = new GreedyInlineFormatFinder(fontTool.format, options.cssAttr);
        },

        command: function (commandArguments) {
            var options = this.options;
                format = this.format;
            return new Editor.FormatCommand(extend(commandArguments, {
                formatter: function () { 
                    var style = {};
                    style[options.domAttr] = commandArguments.value;

                    return new GreedyInlineFormatter(format, { style: style }, options.cssAttr); 
                }
            }))        
        },

        willDelayExecution: inlineFormatWillDelayExecution,

        update: function($ui, nodes, pendingFormats) {
            var that = this,
                list = $ui.data(that.type);

            list.close();

            var pendingFormat = pendingFormats.getPending(that.name);

            var format = (pendingFormat && pendingFormat.params) ? pendingFormat.params.value : that.finder.getFormat(nodes);

            list.value(format);
        },

        initialize: function ($ui, initOptions) {
            var editor = initOptions.editor;

            $ui[type]({
                data: editor[options.name],
                onChange: function (e) {
                    Tool.exec(editor, options.name, e.value);
                },
                onItemCreate: function (e) {
                    e.html = '<span unselectable="on" style="display:block;">' + e.dataItem.Text + '</span>';
                },
                highlightFirst: false
            });

            $ui.data(type).value('inherit');
        }

    });

    var ColorTool = Tool.extend({
        init: function(options) {
            Tool.fn.init.call(colorTool, options);

            this.options = options;
            this.format = [{ tags: dom.inlineElements }];
        },

        update: function($ui) {
            $ui.data('tColorPicker').close();
        },

        command: function (commandArguments) {
            var options = this.options;
            return new Editor.FormatCommand(extend(commandArguments, {
                formatter: function () { 
                    var style = {};
                    style[options.domAttr] = commandArguments.value;

                    return new GreedyInlineFormatter(this.format, { style: style }, options.cssAttr); 
                }
            }));
        },

        willDelayExecution: inlineFormatWillDelayExecution,

        initialize: function($ui, initOptions) {
            var editor = initOptions.editor;
        
            $ui.tColorPicker({
                selectedColor: '#000000',
                onChange: function (e) {
                    Tool.exec(editor, this.options.name, e.value);
                }
            });
        }

    });

    var StyleTool = Tool.extend({
        init: function() {
            var styleTool = this;
            Tool.fn.init.call(styleTool);

            styleTool.format = [{ tags: ['span'] }];
            styleTool.finder = new GreedyInlineFormatFinder(styleTool.format, 'className');
        },

        command: function (commandArguments) {
            return new Editor.FormatCommand(extend(commandArguments, {
                formatter: function () { 
                    return new GreedyInlineFormatter(this.format, { className: commandArguments.value }); 
                }
            }));
        },

        update: function($ui, nodes) {
            var list = $ui.data('tSelectBox');
            list.close();
            list.value(this.finder.getFormat(nodes));
        },

        init: function($ui, initOptions) {
            var editor = initOptions.editor;
        
            $ui.tSelectBox({
                data: editor['style'],
                title: editor.localization.style,
                onItemCreate: function (e) {
                    var style = dom.inlineStyle(editor.document, 'span', {className : e.dataItem.Value});
                
                    e.html = '<span unselectable="on" style="display:block;' + style +'">' + e.html + '</span>';
                },
                onChange: function (e) {
                    Tool.exec(editor, 'style', e.value);
                }
            });
        } 

    });

    extend(kendo.ui.Editor, {
        InlineFormatFinder: InlineFormatFinder,
        InlineFormatter: InlineFormatter,
        GreedyInlineFormatFinder: GreedyInlineFormatFinder,
        GreedyInlineFormatter: GreedyInlineFormatter,
        InlineFormatTool: InlineFormatTool,
        FontTool: FontTool,
        ColorTool: ColorTool,
        StyleTool: StyleTool
    });

})(jQuery);