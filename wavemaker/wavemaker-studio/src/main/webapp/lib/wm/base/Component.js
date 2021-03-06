/*
 *  Copyright (C) 2008-2013 VMware, Inc. All rights reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

dojo.provide("wm.base.Component");
dojo.require('wm.base.Object');
if (!wm.Component ) {
/**
    Base class for all palette objects.
    <br><br>Component:
    <ul>
        <li>can own components, and can itself be owned.</li>
        <li>ensures all owned components have distinct names.</li>
        <li>can be identified by a globally unique string id.</li>
        <li>sends notification messages (via id) when it's values change</li>
        <li>can read or write it's properties to a stream</li>
    @name wm.Component
    @class
    @extends wm.Object
*/

dojo.declare("wm.Component", wm.Object, {
        theme: "wm_tundra", // default theme for all components (including Application and Page)

    /** @lends wm.Component.prototype */
    /**
        Name of this object.
        Must be unique to it's owner.
        @type String
        @example this.label1.setValue("name", "titleLabel");
    */
    name: '',
    /**
        Name of this object.
        Must be unique to it's owner.
        @type String
        @example newButton.setValue("owner", this);
    */
    owner: null,
    //=======================================================
    // Construction
    //=======================================================
    /**
        Component constructor optionally takes a set of properties to initialize on
        the new instance.
        @example
        var foo = new wm.Component({name: "foo"});
        @param {Object} inProperties Properties to initialize on the new instance.
        May be ommitted.
    */
    getParentDialog: function() {
        var w = this;
        while(w) {
            if(w instanceof wm.Dialog) {
                return w;
            } else {
                w = w.parent;
            }
        }
        return null;
    },
    getParentPage: function() {
        if(this instanceof wm.Page || this instanceof wm.PageDialog) return this;
        if(this.owner) return this.owner.getParentPage();
        return null;
    },
    getParentPageOrComposite: function() {
        if(wm.isInstanceType(this, [wm.Page, wm.PageDialog, wm.Composite])) return this;
        if(this.owner) return this.owner.getParentPageOrComposite();
        return null;
    },
    isAncestor: function(inOwner) {
        var o = this.owner;
        while(o && o != inOwner) {
            o = o.owner;
        }
        return(o == inOwner);
    },


    // perhaps should be called getAncestorInstanceOf; returns false if the widget/component lacks parent/owner that
    // is an instance of the specified class, else returns the class itself
    isAncestorInstanceOf: function(inClass) {
        // exit condition
        if (this == app._page || this == app || window["studio"] && (this == studio.application || this == studio.page))
            return false;

        if (wm.isInstanceType(this, inClass)) return this;

        if (this.parent)
            return this.parent.isAncestorInstanceOf(inClass)
        else if (this.owner)
            return this.owner.isAncestorInstanceOf(inClass)
        else
            return false;
    },
    getOwnerApp: function() {
        if (wm.isInstanceType(this, wm.Application)) return this;

        if (!this.isDesignLoaded()) {
            return window.app;
        } else {
            if (this == studio.page)
                return studio.application;
            else
                return this.owner.getOwnerApp();
        }
    },
    constructor: function(inProps) {
        this.$ = this.components = {};
        this._connections = [];
        this._subscriptions = [];
            if (djConfig.isDebug) {
            this._debugSubscriptions = [];
        }
        this._designee = this;
        this.isDestroyed = false;
/* no applicationDestroyed is no longer called
        if (!inProps || !inProps._temporaryComponent) // don't add pointers to this object if its temporary; temporary components may not have destroy called on them properly
        this._subscriptions.push(dojo.subscribe('applicationDestroyed', this, 'destroy')); */
    },
    postscript: function(inProps) {
        this.create(inProps);
        wm.Component.add(this);
    },

    create: function(inProps){
        try {
            this._initializing = true;
        if (wm.debugPerformance) this.startTimerWithName("create",this.declaredClass);
        this.prepare(inProps);
        //this.startTimerWithName("build",this.declaredClass);
        this.build();
        //this.stopTimerWithName("build",this.declaredClass);
        //this.startTimerWithName("init",this.declaredClass);
        this.init();

        if (this._designer)
            wm.fire(this, "designCreate");

        if (!this._loading) {
            this.postInit();
                delete this._initializing;
        }

            if (!this._temporaryComponent)
                dojo.addOnWindowUnload(this, '_unload');
        if (wm.debugPerformance) this.stopTimerWithName("create",this.declaredClass);
    } catch (e) {
        console.error("Error thrown; failed to create " + this.toString() + ": " + e);
    }
    },
    _unload: function() {
    	if (this.owner) this.owner._isUnloading = true;
    	this.destroy();
    },
    /**
        Remove this component from the system and clean up
        all resources.
    */

    destroy: function() {
        if (this.isDestroyed)
            return;
        try
        {
            this._disconnect();
            this._unsubscribe();
            wm.fire(this, "designDestroy");

            var comps = [];
            for (var n in this.components)
                comps.push(this.components[n]);
            for(var i=0, c; (c=comps[i]); i++)
            {
                c.destroy();
                for (var n in c)
                    delete c[n];
                c.isDestroyed = true;
            }
            comps = null;
            delete this.components;
            delete this.$;
            wm.Component.remove(this);
            this.setOwner(null);
            /*
            delete this.owner;
            delete this._designee;
            delete this.target;
            delete this.widgets;
            */
            this.isDestroyed = true;
        }
        catch(e)
        {
            //console.info('error while deleting component', e);
        }
    },
    prepare: function(inProps) {
        this.readProps(inProps);
        dojo.mixin(this, {flags:{}}, inProps);
        this.setOwner(this.owner);
    },
    readProps: function(inProps) {
    },
    build: function() {
    },
    init: function() {
        if (this.isDesignLoaded())
        this._isDesignLoaded = true;

        if (this.manageURL) {
            var connectTo = app ? app : this.getRoot();
            if (wm.Application && connectTo instanceof wm.Application) {
                this.connect(connectTo, "_generateStateUrl", this, "generateStateUrl");
            }
        }

        /* Insure that properties redefined by the theme get the value written to the property
         * rather than just using the prototype's value.  When running studio, a change in the theme
         * can cause properties to change AFTER the component was initialized.
         */
        if (window["studio"] && this.themeableProps) {
            dojo.forEach(this.themeableProps, function(inName) {
                var tmp = this[inName];
                delete this[inName];
                this[inName] = tmp;
            }, this);
        }
    },
    postInit: function() {
        this.valueChanged("", this);
    },
    loaded: function() {
          this._loading = false;
          this.postInit();
           delete this._initializing;
    },
    toString: function(inText) {
        var t = inText || "";
        return '[' + this.declaredClass + ((this.name) ? ':' + this.name : "") +  (this.isDestroyed ? ':' + wm.getDictionaryItem("wm.Component.toString_DESTROYED") : '') + t + ']';
    },
    //=======================================================
    // FIXME: deprecated, remove asap
    //=======================================================
    // Get a named component by ascending owner chain
    getComponent: function(inName) {
        return this.components[inName] || this.owner && this.owner.getComponent(inName);
    },
    //=======================================================
    // Design Support
    //=======================================================
    isDesignedComponent: function() {
/*
        if (!this.isDesignLoaded()) return false;

            var page = this.getParentPage();
        while (page && page.name != "wip")
        page = page.owner;

        return page.name == "wip";
*/
        return this.isDesignLoaded(); // Doh!
        },
    isDesignLoaded: function() {
        if (this._isDesignLoaded !== undefined) return this._isDesignLoaded;

        if (!window.studio || !this.owner) return false;
        if (this.owner == studio.application || this.owner == studio._application) return true; // must come before test for !studio.page
        if (!studio.page && !studio.application && !studio._application) return false;
        if (!this.owner) return false;
        var pp = this.getParentPageOrComposite();
        if (pp && pp == studio.page || this.owner == studio.page) return true; // getParentPage() test failed for PageDialogs owned by studio
        if (this == studio.page) return true;
        if (this.isOwnedBy(studio.application)) return true;
        if (window["app"] && !this.isOwnedBy(window["app"]) && window["app"] != this) return true;
        return false;
    },
    getPath: function() {
        // FIXME: hack, at least move studio awareness to design-only code
        var p = '';
        var o = this.owner;
        while (o && !o._hasCustomPath) o = o.owner;
        if (o && o._hasCustomPath) {
	    return this.owner.getPath();
	} else if (this.isDesignLoaded() && studio.project) {
            p = "projects/" + studio.project.getProjectPath() + "/";
        }

        return p;
    },
    //=======================================================
    // Ownership
    //=======================================================
    addComponent: function(inComponent) {
        var n = inComponent.name;
        //if (this.components[n])
        //  wm.logging && console.debug('Duplicate object name "' + n + '" in owner ' + this);
        this.components[n] = inComponent;
    },
    removeComponent: function(inComponent) {
        if (!this.components)
            return;

        var n = inComponent.name;
        if (this.components[n] == inComponent)
            delete this.components[n];
    },
    setOwner: function(inOwner, nonWritable) {
        var isDesign = this.isDesignLoaded();

        // setOwner is called any time a component is created or destroyed, so is a perfect place for
        // detecting when changes are made
        if (isDesign)
        wm.job("studio.updateDirtyBit",10, function() {studio.updateProjectDirty();});

        var originalOwner = this.owner;
        if (this.owner) {
            this.owner.removeComponent(this);
        }
        this.owner = inOwner;
        //this.cacheRuntimeId = this.getRuntimeId();
        if (this.owner) {
            if (!nonWritable) {
                this.owner.addComponent(this);
                /* It is possible for the owner to have a designer and the child to not have a designer; set this._isDesignLoaded to false to make this happen */
                if (!this._designer && this._isDesignLoaded !== false) {
                    this._designer = this.owner._designer;
                }
            }
            // if the owner has changed between being page and app level, then we need to reset IDs.
            // If there is a way to move components from one page to another, we'll need to do this as well, but
            // that does not yet exist.
            if ((!originalOwner && this.owner instanceof wm.Page == false) ||
            (this.owner != originalOwner && originalOwner &&
            (this.owner instanceof wm.Page == false && originalOwner instanceof wm.Page ||
             this.owner instanceof wm.Page && originalOwner instanceof wm.Page == false)))
            {
            this.updateId();
            // If my id has been changed by this, then so will all of my children's ids...
            if (this.isDesignLoaded())
                this.resetChildIds();
                    }
        }
            delete this.rootId;

    },
    isOwnedBy: function(inOwner) {
        var o = this.owner;
        while (o) {
            if (o == inOwner)
                return true;
            o = o.owner;
        }
    },
    qualifyName: function(inName) {
        inName = this.name + '_' + inName;
        if (window.studio && (window.studio.page == this.owner || window.studio.application == this.owner))
            return inName;
        return this.owner ? this.owner.qualifyName(inName) : inName;
    },
    getUniqueName: function(inName) {
        return wm.findUniqueName(inName, [this, this.components]);
    },
    //=======================================================
    // Name & Id
    //=======================================================
    setName: function(inName) {
        if (!inName)
            return;
        wm.Component.remove(this);
        this.owner.removeComponent(this);
        this.name = inName;
        this.owner.addComponent(this);
        this.updateId();
        wm.Component.add(this);
    },
    updateId: function() {
            var id = this.makeId();
            if (id != this.id) {
            this.id = id;
            delete this.runtimeId;
        }
    },

    // make a streamable id
    // an id is fully qualified within its root
    makeId: function(inName) {
        inName = this.name + (inName ? (this.name ? "." : "") + inName : "");
        return this.owner ? this.owner.getId(inName) : inName;
    },
    /**
        Return a string that can identify a name as a child of
        this component in the namespace of the root object.
        @see <a href="#getRoot">getRoot</a>
        @param {String} inName The name to qualify.
        @returns {String} The qualified id string.
    */
    getId: function(inName) {
        if (inName)  return this.makeId(inName);
        var id = this.id;
        if (!this.id || this.isDesignLoaded()) {
            var id = this.makeId();
            this.id = id;
        }
        return id;
    },
/*
    getBindId: function() {
    var owner = this;
    while(owner && owner instanceof wm.Page == false)
        owner = owner.owner;

    var id = this.getId();

    if (owner == this) {
        return owner.name;
    } else if (owner) {
        return owner.name + "." + id;
    } else {
        return id;
    }
    },
    */
    resetChildIds: function() {
    for(var i in this.components) {
        delete this.components[i].id;
        delete this.components[i].runtimeId;
        delete this.components[i].rootId;
        this.components[i].resetChildIds();
    }
    },

    // get the root object that owns this component and under which its id is qualified
    getRoot: function() {
        if (this.owner)
        return this.owner.getRoot();
        else
        return null;
    },
    // get the root portion of the runtime id
    getRootId: function() {
        if (!this.rootId || this.isDesignLoaded()) {
        var r = this.getRoot();
        r = r ? r.getRuntimeId() : "";
        this.rootId =  r ? r + (r.charAt(r.length-1) == "." ? "" : ".") : "";
        }
        return this.rootId;
    },
    /**
        Return a string that can globally identify a name
        as a child of this component.
        @param {String} inName The name to qualify.
        @returns {String} The qualified id string.
    */
    // make a globally unique runtime id
    getRuntimeId: function(inName) {
        if (!this.runtimeId || this.isDesignLoaded()) {
        this.runtimeId = this.getRootId() + this.getId();
        }
        var result =  (inName) ? this.runtimeId + "." + inName :  this.runtimeId;
        return result;
    },
/*
    getRuntimeId: function(inName) {
        if (this.cacheRuntimeId && this.cacheRuntimeId != '')
        {
            //usingCacheRuntimeId++;
            if (!inName || inName == '')
            {
                return this.cacheRuntimeId;
            }
            else
            {
                return this.cacheRuntimeId + '.' + inName;
            }
        }

        var r = this.getRootId() + this.getId(inName);
        return r;
    },
    */
    // get a value under root using an id
    getValueById: function(inId) {
        /* Not sure if there aren't times when we have a sort of valid ID of 0, "" or false... */
        if (inId === null || inId === undefined) return null;
        var r = this.getRoot();
        r = r && r.getValue(inId);
        var result;
        /* r._wmNull appears to not exist anywhere */
        if (r && r._wmNull) {
          return app.getValue(inId);
        }

        if (r !== undefined) return r;

        if (inId && wm.Component.byId[inId]) {
        return wm.Component.byId[inId];
        }


        // First part of the ID is the page name
        var index = inId.indexOf(".");
        if (index != -1) {
        var pageName = inId.substring(0,index);
        if (pageName.indexOf("[") == 0)
            pageName = pageName.substring(1,pageName.length-1);
        var remainder = inId.substring(index+1);
        var page = wm.Page.getPage(pageName);
        if (page) {
            return page.getValueById(remainder);
        }
        if (this._isDesignLoaded && wm.decapitalize(String(studio.bindDialog.bindSourceDialog.pageContainer.pageName)) == pageName) {
            page = studio.bindDialog.bindSourceDialog.pageContainer.page;
            if (page) {
            return page.getValueById(remainder);
            }
        }
        }

        return undefined;
    },
    /*
    LiveForm does not work with the impovement changes below.
        getValue: function(inName) {
                if (typeof inName != "string" || inName.indexOf(".") != -1)
                        return this.inherited(arguments);
                var s1 = "get" + wm.capitalize(inName);
                var s2 = "get_" + wm.capitalize(inName);
                if (this[s1])
                        return this[s1]();
                else if (this[s2])
                        return this[s2]();
                else
                        return this.inherited(arguments);
        },
        setValue: function(inName, inValue) {
                if (typeof inName != "string" || inName.indexOf(".") != -1)
                        return this.inherited(arguments);
                var s1 = "set" + wm.capitalize(inName);
                var s2 = "set_" + wm.capitalize(inName);
                if (this[s1])
                        return this[s1](inValue);
                else if (this[s2])
                        return this[s2](inValue);
                else
                        return this.inherited(arguments);

        },
    */

    //=======================================================
    // Utility
    //=======================================================
    connect: function() {
        var c = dojo.connect.apply(dojo, arguments);
        this._connections.push(c);
        return c;
    },
    connectOnce: function(sourceObj, sourceMethod, targetObj, targetMethod) {
    var connections = this._connections;
    var args = [sourceObj,sourceMethod];
    if (typeof targetObj == "function") {
        targetMethod = targetObj;
    } else {
        args.push(targetObj);
    }
    args.push(function() {
        dojo.disconnect(c);
        wm.Array.removeElement(connections, c);
        dojo.hitch(this, targetMethod)();
    });

    var c = dojo.connect.apply(dojo,args);

    connections.push(c);
    return c;
    },
    connectEvents: function(inObject, inEvents) {
        this._connections = this._connections.concat(wm.connectEvents(this, inObject, inEvents));
    },

    _disconnect: function(inNode, inEvents) {
        dojo.forEach(this._connections, dojo.disconnect);
        this._connections = [];
    },
    /* Only use this if you want to disconnect a single event from "this" because you plan to keep on using "this".
       If "this" is going to go away, then the destructor takes care of all disconnects */
    disconnectEvent: function(inEvent) {
      this._connections = dojo.filter(this._connections, function(item, index, array) {
        if (item[1] == inEvent) {
          dojo.disconnect(item);
          return false;
        } else
          return true;
        return item[1] != inEvent;
      });
    },
    disconnect: function(connectionObj) {
        dojo.disconnect(connectionObj);
        wm.Array.removeElement(this._connections, connectionObj);
    },
    findConnection: function(inEvent) {
        for (var i = 0; i < this._connections.length; i++) {
        var con = this._connections[i];
        if (con[1] == inEvent)
            return con;
        }
    },
        findSubscription: function(inEvent) {
        for (var i = 0; i < this._subscriptions.length; i++) {
        var con = this._subscriptions[i];
        if (con[0] == inEvent)
            return con;
        }
    },
    subscribe: function() {
            var s = dojo.subscribe.apply(dojo, arguments);
        this._subscriptions.push(s);
        if (djConfig.isDebug) {
        this._debugSubscriptions.push(arguments[0]);
        }
            return s;
    },
        unsubscribe: function(subname) {
            for (var i = this._subscriptions.length-1; i >= 0; i--) {
                if (this._subscriptions[i][0] == subname) {
                    dojo.unsubscribe(this._subscriptions[i]);
                    wm.Array.removeElementAt(this._subscriptions,i);
            if (djConfig.isDebug) {
            wm.Array.removeElementAt(this._debugSubscriptions,i);
            }
                }
            }
        },
    _unsubscribe: function() {
        dojo.forEach(this._subscriptions, dojo.unsubscribe);
        this._subscriptions = [];
            if (djConfig.isDebug) {
            this._debugSubscriptions = [];
        }
    },
    //=======================================================
    // Properties
    //=======================================================
    isEventProp: function(n) {
        if (!this._designee) return false;
        return dojo.isFunction(this._designee[n] || this._designee[n.replace(/\d+$/,"")]) && (n.slice(0,2)=="on");
    },
    isCustomMethodProp: function(n) {
        return dojo.isFunction(this.constructor.prototype[n]) && (n.slice(0,6)=="custom");
    },
    _getProp: function(n) {
        if (this.isEventProp(n))
            return this.eventBindings ? (this.eventBindings[n] || "") : "";
        // do we need this?
        var g = this._getPropWorker(this._designee, n, "get");
        if (g)
            return g.call(this, n);
        return n in this._designee ? this._designee[n] : this.components[n];
    },
    _setProp: function(n, v) {
        if (this.isEventProp(n) && this._isDesignLoaded) {
        this.setEvent(n, v);
        } else if (this.isCustomMethodProp(n) && this._isDesignLoaded) {
        if (v) {
            this._designee[n] = v;
            eventEdit(this, n, v, this.owner == studio.application);
        } else {
            delete this._designee[n];
        }
        } else {
            // do we need this?
            var s = this._getPropWorker(this._designee, n, "set");
            if (s)
                s.call(this, v);
            else
                this._designee[n] = v;
        }
    },
    //=======================================================
    // Values
    //=======================================================
    // id-based notification
    valueChanged: function(inProp, inValue) {
        //console.info('inProp "' + inProp + '" => this.getRootId(): ' + this.getRootId() + ' this.getId(inProp): ' + this.getId(inProp) + ' == '+ this.getRuntimeId(inProp));
        var evtId = this.getRuntimeId(inProp);
        if (evtId == '')
        {
            return;
        }

        //console.info('Event: ' + evtId);
        dojo.publish(evtId + "-changed", [inValue, this]);

        var root = this.getRoot();
        if (root) root = root.getRuntimeId();
        if (root && root.indexOf(".") && evtId.indexOf(root) == 0) {
           var n = evtId.substring(root.length);
        n = root.substring(root.lastIndexOf(".")+1) + n;
        if (n != evtId) {
            var topic = n + "-changed";
            wm.logging && console.group("<== ROOTCHANGED [", topic, "] published by Variable.dataRootChanged");
            dojo.publish(topic, [inValue, this]);
        }
       }

    },
    //=======================================================
    // Streaming In
    //=======================================================
    _create: function(ctor, props) {
        try
        {
          return new ctor(props);
        }
        catch(e)
        {
            console.debug("Component._create: ignoring unknown component type: ", ctor.prototype, props);
        }
        //throw ("Page._create: unknown component type: " + p);
    },
    adjustChildProps: function(inCtor, inProps) {
        dojo.mixin(inProps, {owner: this});
    },
    /**
        Create a component as a child of this component.
        @param inName {String} Name of the new component (may be altered to ensure uniqueness).
        @param inType {String} Type of component to create (note, a string, not a constructor).
        @param inProps {Object} Hash of properties to pass to the new components <a href="#constructor">constructor</a>.
        @param inEvents {Object} Name/value pairs that match events in the new component to functions in the owner.
        @param inChildren {Object} Name/value pairs that describe child components to create on this object.
        @param inOwner {Object} Optional. Override automatic value for "owner".
        @example
this.panel1.createComponent("custom", "wm.Panel", {
    // properties
    height: "3em",
}, {
    // events
    onclick: "click" // connect onclick event to owner's "click" function
}, {
    // children
    // name: [ "[type]", { [properties] }, { [events] }, { [children] } ]
    spacer1: [ "wm.Spacer", { width: "300px" } ],
    content: [ "wm.Label", { width: "1flex" } ],
    spacer2: [ "wm.Spacer", { width: "300px" } ]
});
    */
    createComponent: function(inName, inType, inProps, inEvents, inChildren, inOwner) {
           if (wm.debugPerformance) {
         if (inType == "wm.Layout") {
           if (dojo.isFF)
             console.groupCollapsed("CREATE " + inType + ": " + inName + " AT " + startTime);
           else
             console.group("CREATE " + inType + ": " + inName + " AT " + startTime);
         }
           this.startTimer("CreateComponent", inType);
           }


        var ctor = dojo.getObject(inType);
        if (!ctor)
        {
            //console.info('trying to get component from componentList');
            try
            {
                            /* wm.componentList accessed here */
                wm.getComponentStructure(inType);
                ctor = dojo.getObject(inType);
            }
            catch(e)
            {
                console.info('error while getComponentStructure: ' + e);
            }
        }

        if (!ctor) throw(wm.getDictionaryItem("wm.Component.CLASS_NOT_FOUND", {type: inType, name: inName}));
        var props = dojo.mixin({_designer: this._designer, _loading: true}, inProps);
        this.adjustChildProps(ctor, props);

        /* Special case where a Composite being designed opens a PageDialog at designtime where the PageDialog
         * is itself not being designed but is in fact a wizard
         */
        if (inProps._isDesignLoaded === false) delete props._designer;

        if (inOwner)
            props.owner = inOwner;
        //
        // FIXME: avoid unique names if owner root is loading...
        // fix to prevent extra components in application children
        // FIXME: or owner itself is loading (avoids copy/paste sub-components duplication)

        props.name = props.owner.getRoot()._loading || props.owner._loading ? inName : props.owner.getUniqueName(inName);

        // All custom methods should be page methods; page methods have not been evaled, so
        // can not be defined nor invoked at design time
        if (!this.isDesignLoaded()) {
        for (var p in props) {
            if (p.indexOf("custom") == 0 && dojo.isFunction(ctor.prototype[p])) {
            var owner = props.owner;
            props[p] = dojo.hitch(owner, owner[props[p]]);
            }
        }
        }

        //
        var w = this._create(ctor, props);
                if (w.name != inName && wm.pasting && window["studio"])
                    studio.renamedDuringPaste[inName] = w;

        try{
          if (inEvents && w.owner) {
            w.owner.makeEvents(inEvents, w);
          }
          if (inChildren) {
            w.createComponents(inChildren);
          }
        }
        catch(e){
            console.info('error while creating component: ', e);
        }
        finally{
            try {
            w.loaded();
            if (w.owner && w.owner[w.name] === undefined && !w._isDesignLoaded && !wm.isInstanceType(w, wm.Property)) {
                w.owner[w.name] = w;
            }
            } catch(e) {
            console.error("Error in postInit for " + w.toString() + ": " + e);
            }
        }

        if (wm.debugPerformance) this.stopTimerWithName("CreateComponent",inType,1);
        return w;
    },
    createComponents: function(inComponents, inOwner) {
        var result = [];
        for (var i in inComponents) {
            var c = inComponents[i];
            result.push(this.createComponent(i, c[0], c[1], c[2], c[3], inOwner));
        }
        return result;
    },
    _eventArgs: function(c, a) {
        var args = [ c ];
        for (var i=0,l=a.length; i<l; i++){args.push(a[i])};
        return args;
    },
    makeEvents: function(inEvents, inComponent) {
        var e, n, f;
        var eventsArray = [];
        for (n in inEvents) {
        eventsArray.push(n);
        }
        eventsArray.sort();
        for (var i = 0; i < eventsArray.length; i++) {
        var n = eventsArray[i];

            // name of the source
            f = inEvents[n];
            // the target
            e = this[f] || f;
                if (this._designer) {
                // if designing, it helps to have an actual function of the given name, which events ending in numbers
                // should not have
                if (n.match(/\d+$/) && !inComponent[n])
                inComponent[n] = function(){};

                // if designing, note the eventBinding
                wm.fire(inComponent, "setProp", [n, f]);
                } else {
                // otherwise, connect the named event
                this.connect(inComponent._eventSource||inComponent, n.replace(/\d*$/,""), this.makeEvent(e, f, inComponent, n.replace(/\d*$/,"")));
                // For most events, doing connections this way is a bad idea; many uses of
                // events are done from code rather than inEvents; however, for performance
                // reasons and because dynamically setting onRightClick is something I'm ok not
                // suporting, I've made an exception here.
                if (n.match(/^onRightClick\d*$/)) {

                inComponent.connect(inComponent.domNode, "oncontextmenu", inComponent, function(event) {
                    dojo.stopEvent(event);
                    this.onRightClick(event);
                });
                if (dojo.isFF) { // FF 3.6/4.0 on OSX require this, others may as well
                    inComponent.connect(inComponent.domNode, "onmousedown", inComponent, function(event) {
                    if (event.button == 2 || event.ctrlKey) {
                        dojo.stopEvent(event);
                        this.onRightClick(event);
                    }
                    });
                }

                } else if (n.match(/^onMouseOver\d*$/)) {
                inComponent.createMouseOverConnect();
                } else if (n.match(/^onMouseOut\d*$/)) {
                inComponent.createMouseOutConnect();
                } else if (n.match(/^onEnterKeyPress\d*$/) && inComponent instanceof wm.Container) {
                inComponent.connectOnEnterKey();
                }
            }
        }
    },
        makeEvent: function(inHandler, inName, inComponent, eventName) {
        return dojo.isFunction(inHandler) ? this._makeEvent(inName,inComponent,eventName) : this._makeComponentEvent(inHandler,inComponent,eventName);
    },
    _makeEvent: function(inName, inComponent, eventName) {
        var self = this;
        return function jsEventHandler() {
            var args = arguments;
            var f = function() {
                    if (app.debugDialog && !inComponent.isAncestor(app.debugDialog)) {
                        var eventId = app.debugDialog.newLogEvent({
                            eventType: "javascriptEvent",
                            sourceDescription: (inComponent instanceof wm.Component ? inComponent.getRuntimeId() + "." : "") + eventName + "() has been called",
                            resultDescription: "Calling " + (self instanceof wm.Component ? self.getRuntimeId() + "." : "") + inName + "()",
                            firingId: inComponent instanceof wm.Component ? inComponent.getRuntimeId() : "",
                            affectedId: self.getRuntimeId(),
                            method: inName
                        });

                    }
                    try {
                        self[inName].apply(self, self._eventArgs(this, args));
                    } catch (e) {
                        if (e instanceof Error && e.message == "Abort" || e.toString() == "Abort") throw e;
                        var errorMessage = "Error in " + self.toString() + "." + inName + ": " + e.message;
                        if (djConfig.isDebug) {
                            app.toastError(errorMessage);
                        } else {
                            console.error(errorMessage);
                        }
                    }
                    if (eventId) app.debugDialog.endLogEvent(eventId);
                };

            /* Events should not be fired until the owner has finished loading, as the event may require components that aren't yet generated */
            if (inComponent && eventName && inComponent["_" + eventName + "BeforeStart"]) {
                dojo.hitch(this,f)();
            } else if (self instanceof wm.Page && self._loadingPage) {
                self.connectOnce(self, "start", this, f);
            } else if (self._loading) {
                self.connectOnce(self, "postInit", this, f);
            } else {
                dojo.hitch(this,f)();
            }

        }
    },
    _makeComponentEvent: function(inHandler, inComponent, eventName) {
        var self = this;
        // FIXME: experimental: can call a method on a component
        return function eventHandler(e, optionalTargetComp) {

            // inHandler could be a component
            // or a (string) Id of a component
            // or a (string) Id of a component + a dotted method suffix
            //console.info('inHandler ', inHandler, ' instanceof wm.Component = ' + (inHandler instanceof wm.Component));
            //console.info('wm.isInstanceType = ' + wm.isInstanceType(inHandler, 'wm.Component'));
            var args = arguments;
            var f = function() {
                    var c = wm.isInstanceType(inHandler, wm.Component) ? inHandler : self.getValueById(inHandler);
                    if (wm.isInstanceType(c, wm.Component)) {
                        if (app.debugDialog && !inComponent.isAncestor(app.debugDialog)) {
                            if (c instanceof wm.ServiceVariable) {
                                if (!c._debug) c._debug = {};
                                c._debug = {
                                    trigger: inComponent.getId(),
                                    eventName: eventName,
                                    method: "update",
                                    lastUpdate: new Date()
                                };
                            }
                            var eventId = app.debugDialog.newLogEvent({
                                eventType: "componentEvent",
                                sourceDescription: inComponent.getRuntimeId() + "." + eventName + "() has been called",
                                resultDescription: "Invoking " + c.getRuntimeId(),
                                eventName: eventName,
                                firingId: inComponent.getRuntimeId(),
                                affectedId: c.getRuntimeId(),
                                method: "update"
                            });
                        }
                        if (c.updateInternal) {
                            wm.fire(c, "updateInternal", [e, optionalTargetComp]);
                        } else {
                            wm.fire(c, "update", [e, optionalTargetComp]);
                        }
                        // call a method on a component
                    } else if (dojo.isString(inHandler)) {
                        var o = inHandler.split('.');
                        var m,c;
                        if (o.length > 1) {
                            m = o.pop();
                            c = self.getValueById(o.join("."));
                        } else {
                            c = self;
                            m = o[0];
                        }
                        if (c && c[m]) {
                            if (app.debugDialog && !inComponent.isAncestor(app.debugDialog)) {
                                if (c instanceof wm.ServiceVariable) {
                                    if (!c._debug) c._debug = {};
                                    c._debug = {
                                        trigger: inComponent.getId(),
                                        eventName: eventName,
                                        method: m,
                                        lastUpdate: new Date()
                                    };
                                }
                                var eventId = app.debugDialog.newLogEvent({
                                    eventType: "subcomponentEvent",
                                    sourceDescription: (inComponent instanceof wm.Component ? inComponent.getRuntimeId() + "." : "") + eventName + "() has been called",
                                    resultDescription: "Calling " + c.getRuntimeId() + "." + m + "()",
                                    firingId: inComponent instanceof wm.Component ? inComponent.getRuntimeId() : undefined,
                                    affectedId: c instanceof wm.Component ? c.getRuntimeId() : undefined,
                                    method: m
                                });
                            }
                            // changed from c[m]() so that inSender and all arguments get forwarded
                            try {
                                c[m].apply(c, self._eventArgs(this, args));
                            } catch (e) {
                                if (e instanceof Error && e.message == "Abort" || e.toString() == "Abort") throw e;
                                var errorMessage = "Error in " + self.toString() + "." + m + ": " + e.message;
                                if (djConfig.isDebug) {
                                    app.toastError(errorMessage);
                                } else {
                                    console.error(errorMessage);
                                }
                            }
                        }
                    }

                    if (eventId) app.debugDialog.endLogEvent(eventId);
                };

            /* Events should not be fired until the owner has finished loading, as the event may require components that aren't yet generated */
            if (self instanceof wm.Page && self._loadingPage) {
                self.connectOnce(self, "start", this, f);
            } else if (self._loading) {
                self.connectOnce(self, "postInit", this, f);
            } else {
                dojo.hitch(this,f)();
            }
        }
    },
    readComponents: function(inComponents) {
        var c = dojo.fromJson(inComponents);
        return this.createComponents(c);
    },
     startTimerWithName: function(timerName, componentName) {
      if (!wm.debugPerformance) return;
      if (!this.logTimesWithComponentNames) this.logTimesWithComponentNames = {};
      if (!this.logTimesWithComponentNames[componentName]) this.logTimesWithComponentNames[componentName] = {};
      this.logTimesWithComponentNames[componentName][timerName] = new Date().getTime();
     },
    stopTimerWithName: function(timerName, componentName) {
      if (!wm.debugPerformance) return;
      if (!this.logTimesWithComponentNames) this.logTimesWithComponentNames = {};
      if (!this.logTimesWithComponentNames[componentName]) this.logTimesWithComponentNames[componentName] = {};
      var startTime = this.logTimesWithComponentNames[componentName][timerName];
      if (!startTime) return -1;
      this.logTimesWithComponentNames[componentName][timerName] = 0;

      var result = new Date().getTime() - startTime;

        var timingObj = wm.Component.timingByComponent[componentName];
        if (!timingObj) {
        wm.Component.timingByComponent[componentName] = {};
        timingObj = wm.Component.timingByComponent[componentName];
        }
        if (!timingObj[timerName]) timingObj[timerName] = [];
        timingObj[timerName].push(result);

      return result;
    },
        subtractTimerWithName: function(timerName, componentName,time) {
      if (!wm.debugPerformance) return;
      if (!this.logTimesWithComponentNames) this.logTimesWithComponentNames = {};
      if (!this.logTimesWithComponentNames[componentName]) this.logTimesWithComponentNames[componentName] = {};
      var startTime = this.logTimesWithComponentNames[componentName][timerName];
      if (!startTime) return -1;
        var timingObj = wm.Component.timingByComponent[componentName];
        if (!timingObj) {
        wm.Component.timingByComponent[componentName] = {};
        timingObj = wm.Component.timingByComponent[componentName];
        }
        var tmp = timingObj[timereName];
        tmp[tmp.length-1] -= time;
    },
    startTimer: function(timerName) {
      if (!wm.debugPerformance) return;
      if (!this.logTimes) this.logTimes = {};
      this.logTimes[timerName] = new Date().getTime();
    },
    stopTimer: function(timerName, addToComponentLog) {
      if (!wm.debugPerformance) return;
      if (!this.logTimes) this.logTimes = {};
      var startTime = this.logTimes[timerName];
      if (!startTime) return -1;
      this.logTimes[timerName] = 0;
      var result = new Date().getTime() - startTime;

      if (addToComponentLog) {
        var timingObj = wm.Component.timingByComponent[this.declaredClass];
        if (!timingObj) {
          wm.Component.timingByComponent[this.declaredClass] = {};
          timingObj = wm.Component.timingByComponent[this.declaredClass];
        }
        if (!timingObj[timerName]) timingObj[timerName] = [];
        timingObj[timerName].push(result);
      }
      return result;
    }
});

//=======================================================
// Class Properties
//=======================================================
dojo.mixin(wm.Component, {
    //=======================================================
    // Component registry
    //=======================================================
    /** @lends wm.Component */
    byId: {},
    byShortId: {},
    timingByComponent: {},
    add: function(inComponent){
    if (inComponent._temporaryComponent) return;
    var rid = inComponent.getRuntimeId();
    wm.Component.byId[rid] = inComponent;
    },
    remove: function(inComponent){
    delete wm.Component.byId[inComponent.getRuntimeId()];
    },
    property: {
    }
});
}
//window.$$ = wm.Component.byId;
