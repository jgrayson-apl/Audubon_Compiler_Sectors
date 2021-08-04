/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.​
*/

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/_base/lang",
  "dojo/_base/Color",
  "dojo/colors",
  "dojo/number",
  "dojo/query",
  "dojo/on",
  "dojo/mouse",
  "dojo/dom",
  "dojo/dom-attr",
  "dojo/dom-class",
  "dojo/dom-geometry",
  "dojo/dom-construct",
  "dstore/Memory",
  "dstore/Trackable",
  "dgrid/OnDemandList",
  "dgrid/Selection",
  "esri/identity/IdentityManager",
  "esri/request",
  "esri/core/lang",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/layers/Layer",
  "esri/layers/FeatureLayer",
  "esri/tasks/support/Query",
  "esri/Graphic",
  "esri/tasks/GeometryService",
  "esri/geometry/geometryEngine",
  "esri/geometry/Point",
  "esri/geometry/Multipoint",
  "esri/geometry/Polyline",
  "esri/geometry/Extent",
  "esri/geometry/Circle",
  "esri/geometry/Polygon",
  "esri/widgets/Sketch/SketchViewModel",
  "esri/widgets/Feature",
  "esri/widgets/Home",
  "esri/widgets/Search",
  "esri/widgets/LayerList",
  "esri/widgets/Legend",
  "esri/widgets/Print",
  "esri/widgets/ScaleBar",
  "esri/widgets/Compass",
  "esri/widgets/BasemapGallery",
  "esri/widgets/Expand"
], function(calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
            lang, Color, colors, number, query, on, mouse,
            dom, domAttr, domClass, domGeom, domConstruct,
            Memory, Trackable, OnDemandList, Selection,
            IdentityManager, esriRequest, esriLang, Evented, watchUtils, promiseUtils, Portal, Layer, FeatureLayer, Query, Graphic,
            GeometryService, geometryEngine, Point, Multipoint, Polyline, Extent, Circle, Polygon, SketchViewModel,
            Feature, Home, Search, LayerList, Legend, Print, ScaleBar, Compass, BasemapGallery, Expand){

  const TrackableMemory = declare([Memory, Trackable]);
  const SelectableList = declare([OnDemandList, Selection]);

  return declare([Evented], {

    // USED TO REMOVE SLIVERS //
    SLIVERS_MIN_AREA_INFO: {
      AREA: 5000.0,
      UNITS: "square-meters"
    },

    // GEOMETRY ENGINE SETTINGS FOR GEOMETRY OPERATIONS //
    CLEAN_INFO: {
      DENSIFY_DISTANCE: 500.0,
      GENERALIZE_DISTANCE: 5.0
    },

    /**
     *
     */
    constructor: function(){
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: function(base){
      if(!base){
        console.error("ApplicationBase is not defined");
        return;
      }
      domHelper.setPageLocale(base.locale);
      domHelper.setPageDirection(base.direction);

      const config = base.config;
      const results = base.results;
      const webMapItems = results.webMapItems;
      const validWebMapItems = webMapItems.map(response => {
        return response.value;
      });
      const firstItem = validWebMapItems[0];
      if(!firstItem){
        console.error("Could not load an item to display");
        return;
      }
      dom.byId("app-title-node").innerHTML = config.title = (config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(config.title);

      // this.displayMapDetails(firstItem);

      const portalItem = base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;
      const viewProperties = itemUtils.getConfigViewProperties(config);
      viewProperties.container = dom.byId("view-container");

      itemUtils.createMapFromItem({ item: firstItem, appProxies: appProxies }).then(map => {
        viewProperties.map = map;
        itemUtils.createView(viewProperties).then(view => {
          this.viewReady(base, config, view).then(() => {
            /*...*/
          });
        });
      });

    },

    /**
     *
     * @param base
     * @param config
     * @param view
     */
    viewReady: function(base, config, view){

      // LOADING //
      const updatingNode = dom.byId("loading-node");
      view.ui.add(updatingNode, "bottom-right");
      watchUtils.init(view, "updating", (updating) => {
        domClass.toggle(updatingNode, "is-active", updating);
      });

      // USER SIGN IN //
      this.initializeUserSignIn().always(() => {

        // DISABLE ROTATION //
        view.constraints.rotationEnabled = false;
        // DON'T SNAP TO ZOOM LEVELS //
        view.constraints.snapToZoom = false;

        // HOME //
        const homeWidget = new Home({ view: view });
        view.ui.add(homeWidget, { position: "top-left", index: 0 });

        // SCALEBAR //
        const scaleBar = new ScaleBar({ view: view, unit: "dual" });
        view.ui.add(scaleBar, { position: "bottom-left" });

        // BASEMAP GALLERY //
        const basemapGallery = new BasemapGallery({
          view: view,
          container: domConstruct.create("div")
        });
        // EXPAND BASEMAP GALLERY //
        const basemapGalleryExpand = new Expand({
          view: view,
          content: basemapGallery.domNode,
          expandIconClass: "esri-icon-basemap",
          expandTooltip: "Basemap"
        }, domConstruct.create("div"));
        view.ui.add(basemapGalleryExpand, { position: "top-left", index: 2 });

        // INITIALIZE AUDUBON COMPILER //
        this.initializeAudubonCompiler(view).then(() => {
          // LEGEND - TESTING ONLY //
          // const legend = new Legend({ view: view });
          // view.ui.add(legend, { position: "bottom-right", index: 2 });

          // PRINT //
          const print = new Print({
            view: view,
            printServiceUrl: config.helperServices.printTask.url || base.portal.helperServices.printTask.url,
            templateOptions: { title: config.title }
          }, "print-node");

          // UPDATE PRINT OPTIONS //
          this.updatePrintOptions = (title, author) => {
            print.templateOptions.title = title;
            print.templateOptions.author = author;
          };

          // WORKAROUND FOR PRINTED DUPLICATE LEGEND ENTRIES //
          esriRequest.setRequestPreCallback((ioArgs) => {
            if(ioArgs.url.startsWith(print.printServiceUrl)){
              print.viewModel._printTask._legendLayers.length = 0;
            }
            return ioArgs;
          });

        });
      });

    },

    /**
     * USER SIGN IN
     */
    initializeUserSignIn: function(){

      // TOGGLE SIGN IN/OUT //
      let signInNode = dom.byId("sign-in-node");
      let signOutNode = dom.byId("sign-out-node");
      let userNode = dom.byId("user-node");

      // SIGN IN //
      let userSignIn = () => {
        this.portal = new Portal({ authMode: "immediate" });
        return this.portal.load().then(() => {
          dom.byId("user-firstname-node").innerHTML = this.portal.user.fullName.split(" ")[0];
          dom.byId("user-fullname-node").innerHTML = this.portal.user.fullName;
          dom.byId("username-node").innerHTML = this.portal.user.username;
          dom.byId("user-thumb-node").src = this.portal.user.thumbnailUrl;
          domClass.add(signInNode, "hide");
          domClass.remove(userNode, "hide");
        });
      };

      // SIGN OUT //
      let userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.portal = new Portal({});
        this.portal.load().then(() => {
          this.portal.user = null;
          domClass.remove(signInNode, "hide");
          domClass.add(userNode, "hide");
        });
      };

      // CALCITE CLICK EVENT //
      on(signInNode, "click", userSignIn);
      on(signOutNode, "click", userSignOut);

      // PORTAL //
      this.portal = new Portal({});
      return this.portal.load().then(() => {
        // CHECK THE SIGN IN STATUS WHEN APP LOADS //
        return IdentityManager.checkSignInStatus(this.portal.url).then(userSignIn);
      });
    },

    /**
     * DISPLAY MAP DETAILS
     *
     * @param portalItem
     */
    /*displayMapDetails: function (portalItem) {

      const itemLastModifiedDate = (new Date(portalItem.modified)).toLocaleString();

      dom.byId("current-map-card-thumb").src = portalItem.thumbnailUrl;
      dom.byId("current-map-card-thumb").alt = portalItem.title;
      dom.byId("current-map-card-caption").innerHTML = `A map by ${portalItem.owner}`;
      dom.byId("current-map-card-caption").title = "Last modified on " + itemLastModifiedDate;
      dom.byId("current-map-card-title").innerHTML = portalItem.title;
      dom.byId("current-map-card-title").href = `https://www.arcgis.com/home/item.html?id=${portalItem.id}`;
      dom.byId("current-map-card-description").innerHTML = portalItem.description;

    },*/

    /**
     *
     * @param view
     */
    initializeAudubonCompiler: function(view){

      //
      // GO TO FEATURE //
      //
      this.goToFeature = (feature) => {
        const gotoGeom = feature.geometry.clone();
        const goToExtent = gotoGeom.extent.clone().expand(1.1);
        return view.goTo({ target: goToExtent }, { animate: true }).then(() => {
          //feature.layer.refresh();
          return watchUtils.whenFalseOnce(view, 'updating').then();
        });
      };

      // CIRCLES LAYER //
      const circlesLayer = view.map.layers.find((layer) => {
        return (layer.title === "CBC 120 Circles") && (layer.type === "feature");
      });
      return circlesLayer.load().then(() => {
        //circlesLayer.outFields = ["*"];
        circlesLayer.popupEnabled = false;

        // CIRCLE ID FIELD //
        this.circleIDField = "Abbrev";

        // CIRCLE LOCATIONS LAYER //
        const circleLocationsLayer = view.map.layers.find((layer) => {
          return (layer.title === "CBC 120 Locations") && (layer.type === "feature");
        });
        return circleLocationsLayer.load().then(() => {
          //circleLocationsLayer.outFields = ["*"];
          circleLocationsLayer.popupEnabled = false;

          // OVERRIDE RENDERER //
          const circle_location_uvi = circleLocationsLayer.renderer.uniqueValueInfos[4]; // yellow icon
          circleLocationsLayer.renderer = {
            type: "simple",
            label: "Circle Center point",
            symbol: circle_location_uvi.symbol
          };

          // SOURCE SECTORS LAYER //
          const sectorsLayer = view.map.layers.find((layer) => {
            return (layer.title === "CBC 120 Sectors") && (layer.type === "feature");
          });
          return sectorsLayer.load().then(() => {
            sectorsLayer.popupEnabled = false;

            sectorsLayer.labelingInfo = [
              {
                labelExpressionInfo: { expression: "$feature.sector_name" },
                symbol: {
                  type: "text",
                  color: "black",
                  haloSize: 1,
                  haloColor: "white"
                }
              }
            ];
            sectorsLayer.labelsVisible = true;
            //console.info(sectorsLayer);

            // OVERRIDE RENDERER //
            sectorsLayer.renderer = {
              type: "simple",
              label: "Circle sectors",
              symbol: sectorsLayer.renderer.symbol
            };

            // SECTIONS LAYER //
            return this.initializeSectorsEditing(view, sectorsLayer).then(() => {

              this.layersVisibility = (visible) => {
                circlesLayer.visible = visible;
                circleLocationsLayer.visible = visible;
                sectorsLayer.visible = visible;
              };

              // FILTER BY CIRCLE //
              this.filterByCircle = (circleFeature) => {
                if(circleFeature){
                  // CIRCLE ID //
                  const circleID = circleFeature.getAttribute(this.circleIDField);
                  // CIRCLE FILTER //
                  circlesLayer.definitionExpression = `(${this.circleIDField} = '${circleID}')`;
                  circleLocationsLayer.definitionExpression = `(${this.circleIDField} = '${circleID}')`;
                  sectorsLayer.definitionExpression = `(circle_id = '${circleID}')`;
                } else {
                  // CLEAR FILTER //
                  circlesLayer.definitionExpression = "1=1";
                  circleLocationsLayer.definitionExpression = "1=1";
                  sectorsLayer.definitionExpression = "1=2";
                }

                circlesLayer.refresh();
                // circleLocationsLayer.refresh();
                // sectorsLayer.refresh();

                //return promiseUtils.resolve(); // watchUtils.whenFalseOnce(view, 'updating'); //.then();
              };
              this.filterByCircle();

              // SKETCHING TOOLS //
              this.initSketchingTool(view);

              // FIND CIRCLE //
              this.initializeFindCompiler(view, circlesLayer);

              // EMAIL SIGN IN //
              this.initializeEmailSignIn(view, circlesLayer);

              // VIDEO TUTORIALS //
              this.initializeVideoTutorials();

            });
          });

        });

      });

    },

    /**
     *
     */
    initializeVideoTutorials: function(){

      const video_select = dom.byId("video-select");
      on(video_select, "change", () => {
        query(".video-panel").addClass("hide");
        query(".edit-tip").addClass("hide");
        const node_ids = video_select.value.split(",");
        node_ids.forEach(node_id => {
          domClass.remove(node_id, "hide");
        });
      });

    },

    /**
     *
     * @param view
     * @param circlesLayer
     */
    initializeFindCompiler: function(view, circlesLayer){

      const searchResultsCount = dom.byId("search-results-count");
      const circleCandidatesList = dom.byId("circle-candidates-list");

      const findCircleInput = dom.byId("find-circle-input");
      domClass.remove(findCircleInput, "btn-disabled");

      const clearCircleSearch = dom.byId("clear-circle-search");
      on(clearCircleSearch, "click", () => {
        findCircleInput.value = "";
        clearResults();
        domConstruct.empty(circleCandidatesList);
      });

      const clearResults = () => {
        searchResultsCount.innerHTML = "0";
        domClass.remove(searchResultsCount, "label-blue");
        domConstruct.empty(circleCandidatesList);
      };

      const findCircleCandidates = () => {
        const compilerName = findCircleInput.value.trim();
        if(compilerName && compilerName.length > 0){
          if(this.findCandidatesHandle && (!this.findCandidatesHandle.isFulfilled())){
            this.findCandidatesHandle.cancel();
          }
          this.findCandidatesHandle = _findCircleCandidates(compilerName);
        } else {
          domConstruct.empty(circleCandidatesList);
        }
      };

      // FIND CANDIDATE CIRCLE FEATURES //
      const _findCircleCandidates = (compilerName) => {

        const circlesQuery = circlesLayer.createQuery();
        circlesQuery.returnGeometry = false;
        circlesQuery.returnDistinctValues = true;
        circlesQuery.outFields = ["*"];

        const compilerNameParts = compilerName.split(" ");
        if(compilerNameParts.length > 1){
          circlesQuery.where = `(Lower(FirstName) LIKE '%${compilerNameParts[0].toLowerCase()}%') AND (Lower(LastName) LIKE '%${compilerNameParts[1].toLowerCase()}%')`;
        } else {
          circlesQuery.where = `(Lower(FirstName) LIKE '%${compilerName.toLowerCase()}%') OR (Lower(LastName) LIKE '%${compilerName.toLowerCase()}%')`;
        }

        return circlesLayer.queryFeatures(circlesQuery).then((circlesFeatureSet) => {

          const circleFeatures = circlesFeatureSet.features;
          domClass.add(searchResultsCount, "label-blue");
          searchResultsCount.innerHTML = number.format(circleFeatures.length);
          domConstruct.empty(circleCandidatesList);

          circleFeatures.forEach((circleFeature) => {

            const circleNode = domConstruct.create("div", {
              className: "side-nav-link",
              innerHTML: `${circleFeature.getAttribute("FirstName")} ${circleFeature.getAttribute("LastName")}`
            }, circleCandidatesList);
            on(circleNode, "click", () => {

              clearResults();
              findCircleInput.value = "";
              calcite.bus.emit("drawer:close", { id: "find-compiler-drawer" });

              const emailInput = dom.byId("email-input");
              emailInput.value = circleFeature.getAttribute("EmailAddress");
              emailInput.dispatchEvent(new Event("change"));

            });

          });
        });
      };

      on(findCircleInput, "input", () => {
        clearResults();
        const compilerName = findCircleInput.value;
        const hasName = (compilerName && compilerName.length > 0);
        if(hasName && compilerName.length > 1){
          findCircleCandidates();
        }
      });
      on(findCircleInput, "change", () => {
        const candidateNodes = query(".side-nav-link", circleCandidatesList);
        if(candidateNodes.length === 1){
          candidateNodes[0].click();
        }
      });

    },

    /**
     *
     * @param view
     * @param circlesLayer
     */
    initializeEmailSignIn: function(view, circlesLayer){

      // COMPILER CIRCLES //
      let compilerCircles = new Map();

      // CIRCLE SELECT //
      const circleSelect = dom.byId("circle-select");
      on(circleSelect, "change", () => {
        emailSignInBtn.click();
      });

      const emailInput = dom.byId("email-input");
      const emailInputMessage = dom.byId("email-input-message");
      const emailSignInBtn = dom.byId("email-signin-btn");

      // VALIDATE EMAIL //
      const validateEmail = (selectFound) => {
        compilerCircles.clear();
        domConstruct.empty(circleSelect);

        // domClass.add(emailSignInTestBtn, "btn-disabled");
        domClass.add(emailSignInBtn, "btn-disabled");

        const compilerEmail = emailInput.value.trim();
        const hasEmail = (compilerEmail && compilerEmail.length > 0);
        if(hasEmail){

          const featuresByEmailQuery = circlesLayer.createQuery();
          featuresByEmailQuery.where = `EmailAddress = '${compilerEmail}'`;
          featuresByEmailQuery.outFields = ["*"];
          //featuresByEmailQuery.maxAllowableOffset = 1.0;

          circlesLayer.queryFeatures(featuresByEmailQuery).then((circlesFeatureSet) => {
            const foundEmail = (circlesFeatureSet.features.length > 0);
            // domClass.toggle(emailSignInTestBtn, "btn-disabled", foundEmail);
            domClass.toggle(emailSignInBtn, "btn-disabled", !foundEmail);
            domClass.toggle(emailInputMessage, "is-active", !foundEmail);
            domClass.toggle(emailInput, "input-error", !foundEmail);
            domClass.toggle(emailInput, "input-success", foundEmail);
            if(foundEmail){
              //console.info("EmailAddress: ", compilerEmail, "Features: ", circlesFeatureSet.features);

              circlesFeatureSet.features.forEach((circleFeature) => {
                const circleID = circleFeature.getAttribute(this.circleIDField);
                if(circleID){
                  compilerCircles.set(circleID, circleFeature);
                  domConstruct.create("option", {
                    value: circleID,
                    innerHTML: `${circleFeature.getAttribute("Abbrev")}: ${circleFeature.getAttribute("Name")}`
                  }, circleSelect);
                }
              });

              if(selectFound){
                emailSignInBtn.click();
              }
            }
          });
        } else {
          domClass.add(emailInputMessage, "is-active");
          domClass.add(emailInput, "input-error");
          domClass.remove(emailInput, "input-success");
        }
      };

      // VALIDATE EMAIL //
      on(emailInput, "input", () => {
        validateEmail(false)
      });
      on(emailInput, "change", () => {
        validateEmail(true);
      });

      // COMPILER SIGN IN //
      on(emailSignInBtn, "click", () => {
        const compilerCircle = compilerCircles.get(circleSelect.value);
        this.selectCircle(view, compilerCircle);
      });


      // ADMIN SIGN IN //
      on(dom.byId("admin-signin-btn"), "click", () => {
        dom.byId("sign-in-node").click();
      });

      watchUtils.whenFalseOnce(view, 'updating', () => {
        // OPEN EMAIL SIGN IN DIALOG //
        calcite.bus.emit("modal:open", { id: "email-signin-dialog" });
      });

    },

    /**
     *
     * @param view
     * @param sectorsLayer
     */
    initializeSectorsEditing: function(view, sectorsLayer){

      // FEATURE VIEW //
      const featureView = new Feature({ container: dom.byId("sector-node"), view: view });

      // HIGHLIGHT //
      let has_highlight = false;
      let highlight_polygon = new Graphic({
        symbol: {
          type: "simple-fill",
          color: Color.named.transparent,
          outline: { color: Color.named.cyan, width: "2.5px" }
        }
      });
      let highlight_vertices = new Graphic({
        symbol: {
          type: "simple-marker",
          style: "diamond",
          color: Color.named.cyan.concat(0.8),
          size: "7px",
          outline: {
            type: "simple-line",
            color: Color.named.dodgerblue.concat(0.8),
            width: 0.5
          }
        }
      });
      view.graphics.addMany([highlight_polygon, highlight_vertices]);

      this.highlightSector = (feature, scrollTo) => {
        this.displaySketchError();
        view.graphics.removeMany([highlight_polygon, highlight_vertices]);
        if(feature){

          highlight_polygon = highlight_polygon.clone();
          highlight_polygon.geometry = feature.geometry.clone();

          highlight_vertices = highlight_vertices.clone();
          highlight_vertices.geometry = new Multipoint({
            spatialReference: highlight_polygon.geometry.spatialReference,
            points: highlight_polygon.geometry.rings.reduce((vertices, ring) => {
              return vertices.concat(ring);
            }, [])
          });

          view.graphics.addMany([highlight_polygon, highlight_vertices]);
        }
        if(scrollTo){
          this.scrollToSector(feature);
        }
        this.displaySectorPopup(feature);

        has_highlight = (feature != null);
        this.emit("feature-selected", { feature: feature });
      };


      let highlight_when_ready_handle = null;
      this.highlightSectorWhenReady = (feature) => {
        highlight_when_ready_handle && highlight_when_ready_handle.remove();
        const feature_oid = feature.getAttribute(feature.layer.objectIdField);
        highlight_when_ready_handle = this.on("sector-feature-added", (evt) => {
          if(evt.oid === feature_oid){
            highlight_when_ready_handle.remove();
            this.highlightSector(evt.feature, true);
          }
        });
      };


      // CLEAR SELECTED SECTOR //
      on(dom.byId("clear-selected-sector"), "click", () => {
        this.highlightSector(null, true);
      });

      const findSectorFeature = (evt) => {
        return view.hitTest(evt).then((response) => {
          const visibleLayerResult = response.results.find((result) => {
            return (result.graphic.layer && result.graphic.layer.visible && (result.graphic.layer.id === sectorsLayer.id));
          });
          return (visibleLayerResult != null) ? visibleLayerResult.graphic : null;
        });
      };

      const pointer_click_event = on.pausable(view, "click", (clickEvt) => {
        clickEvt.stopPropagation();
        if(!this.isSketching()){
          findSectorFeature(clickEvt).then((sector_feature) => {
            this.highlightSector(sector_feature, true);
          });
        } else {
          console.warn("...click event while sketching...")
        }
      });

      /* const pointer_dblclick_event = on.pausable(view, "double-click", (dblClickEvt) => {
         dblClickEvt.stopPropagation();
         if(!this.isSketching()) {
           findSectorFeature(dblClickEvt).then((sector_feature) => {
             if(sector_feature) {
               this.highlightSector(null, true);
               this.startFeatureUpdate(sector_feature);
             }
           });
         } else {
           console.warn("...double-click event while sketching...")
         }
       });*/

      this.enableViewClickEvents = (enabled) => {
        if(enabled){
          pointer_click_event.resume();
          //pointer_dblclick_event.resume();
        } else {
          pointer_click_event.pause();
          //pointer_dblclick_event.pause();
        }
      };

      this.toggleSectorsLayerPopup = (enabled) => {
        if(!enabled){
          this.highlightSector(null, true);
          featureView.graphic = null;
        }
        this.enableViewClickEvents(enabled);
      };

      const objectIdField = sectorsLayer.objectIdField;

      return view.whenLayerView(sectorsLayer).then((sectorsLayerView) => {
        return watchUtils.whenDefinedOnce(sectorsLayerView, "controller", (controller) => {

          const createSectorNode = (feature) => {

            // SECTOR NODE //
            const sectorNode = domConstruct.create("div", {
              className: "section-node side-nav-link",
              title: feature.getAttribute("sector_id"),
              id: "sector-id-" + feature.getAttribute("sector_id")
            });

            // GOTO SECTOR //
            on(sectorNode, "dblclick", () => {
              this.goToFeature(feature);
            });
            // SELECTOR SECTOR //
            on(sectorNode, "click", () => {
              this.highlightSector(feature, false);
            });

            // NAME NODE //
            const nameNode = domConstruct.create("span", { innerHTML: feature.getAttribute("sector_name") }, sectorNode);

            // ACTIONS NODE //
            const actionsNode = domConstruct.create("div", { className: "actions-node right" }, sectorNode);

            // EDIT NAME NODE //
            const editNode = domConstruct.create("span", {
              className: "icon-ui-edit",
              title: "Edit sector name..."
            }, actionsNode);
            on(editNode, "click", (editEvt) => {
              editEvt.stopPropagation();
              domClass.add(actionsNode, "hide");
              domClass.add(nameNode, "hide");

              // NAME INPUT //
              const nameInput = domConstruct.create("input", {
                type: "text",
                placeHolder: "Enter sector name here...",
                value: feature.getAttribute("sector_name"),
                onfocus: document.execCommand('selectall')
              }, sectorNode);
              nameInput.focus();
              nameInput.select();
              // ERROR NODE //
              const errorNode = domConstruct.create("div", {
                className: "input-error-message",
                innerHTML: "Sector name can't be empty..."
              }, sectorNode);

              // SAVE NAME EDIT //
              const saveNameEdit = () => {
                if(nameInput.value && nameInput.value.length > 0){
                  feature.setAttribute("sector_name", nameInput.value);
                  nameNode.innerHTML = nameInput.value;
                  this.updateSectorFeature(feature);
                } else {
                  domConstruct.destroy(nameInput);
                  domConstruct.destroy(errorNode);
                  domClass.remove(actionsNode, "hide");
                  domClass.remove(nameNode, "hide");
                }
              };
              // NAME INPUT EVENTS //
              on(nameInput, "click", (clickEvt) => {
                clickEvt.stopPropagation();
              });
              on(nameInput, "input", (inputEvt) => {
                inputEvt.stopPropagation();
                const isValid = (nameInput.value && nameInput.value.length > 0);
                domClass.toggle(nameInput, "input-error", !isValid);
                domClass.toggle(errorNode, "is-active", !isValid);
              });
              on(nameInput, "blur", (blurEvt) => {
                blurEvt.stopPropagation();
                saveNameEdit();
              });
              on(nameInput, "keyup", (keyEvt) => {
                keyEvt.stopPropagation();
                if(["Enter", "Escape"].indexOf(keyEvt.key) > -1){
                  saveNameEdit();
                }
              });
            });

            // REMOVE SECTOR NODE //
            const clearNode = domConstruct.create("span", {
              className: "icon-ui-redX icon-ui-close",
              title: "Remove Sector"
            }, actionsNode);
            on(clearNode, "click", (evt) => {
              evt.stopPropagation();
              this.removeSectorFeature(feature);
            });

            return sectorNode;
          };

          // STORE //
          const featureStore = new TrackableMemory({ idProperty: objectIdField, data: [] });
          // LIST //
          const featureList = new SelectableList({
            bufferRows: Infinity,
            noDataMessage: "No Sectors",
            selectionMode: "single",
            sort: [{ property: "sector_id", descending: false }],
            renderRow: createSectorNode,
            collection: featureStore
          }, domConstruct.create("div", {}, "sections-list"));
          featureList.startup();

          // GRAPHICS COLLECTION //
          const graphicsCollection = controller.graphics;
          graphicsCollection.on("change", (evt) => {
            this.highlightSector();

            const featureCount = graphicsCollection.length;
            dom.byId("sections-count").innerHTML = number.format(featureCount);
            domClass.toggle("sections-goto", "btn-disabled", (featureCount === 0));
            domClass.toggle("sections-clear", "btn-disabled", (featureCount === 0));

            // REMOVED //
            evt.removed.forEach((feature) => {
              featureStore.removeSync(feature.getAttribute(objectIdField));
            });
            // ADDED //
            evt.added.forEach((feature) => {
              //feature[objectIdField] = feature.getAttribute(objectIdField);
              featureStore.putSync(lang.delegate(feature, feature.attributes));
              this.emit("sector-feature-added", { oid: feature.getAttribute(objectIdField), feature: feature });
            });


            // AREA //
            const sectors_area_sq_miles = graphicsCollection.reduce((area, feature) => {
              return area + geometryEngine.geodesicArea(feature.geometry, "square-miles");
            }, 0.0);
            dom.byId("sectors-area-input").value = +sectors_area_sq_miles.toFixed(2);

            // COVERAGE //
            const max_area_sq_miles = 176.61;
            dom.byId("sectors-coverage").innerHTML = `${((sectors_area_sq_miles / max_area_sq_miles) * 100.0).toFixed(1)} %`;

            //this.testOverlappingSectors();
          });

          /*this.getSectorFeatureByOID = (oid) => {
            return graphicsCollection.find(sectorFeature => {
              return (sectorFeature.getAttribute(objectIdField) === oid);
            });
          };*/

          this.getSectorPolygons = () => {
            return graphicsCollection.reduce((sectorPolygons, sectorFeature) => {
              return (sectorFeature.geometry != null) ? sectorPolygons.concat(sectorFeature.geometry) : sectorPolygons;
            }, []);
          };

          this.filterSectorPolygons = (feature) => {
            return graphicsCollection.reduce((sectorPolygons, sectorFeature) => {
              return (sectorFeature !== feature) && (sectorFeature.geometry != null) ? sectorPolygons.concat(sectorFeature.geometry) : sectorPolygons;
            }, []);
          };

          this.hasOverlappingSectors = () => {
            return graphicsCollection.some((sectorFeatureA) => {
              return graphicsCollection.some((sectorFeatureB) => {
                return (sectorFeatureA !== sectorFeatureB) && geometryEngine.overlaps(sectorFeatureA.geometry, sectorFeatureB.geometry);
                //return (sectorFeatureA !== sectorFeatureB) && geometryEngine.relate(sectorFeatureA.geometry, sectorFeatureB.geometry, "T*T***T**");
              });
            });
          };

          /* this.testOverlappingSectors = () => {
             const has_overlapping = this.hasOverlappingSectors();
             domClass.toggle("sectors-coverage", "label-blue", !has_overlapping);
             domClass.toggle("sectors-coverage", "label-red", has_overlapping);
           };*/


          this.displaySectorPopup = (sectorsFeature) => {
            featureView.graphic = sectorsFeature;
          };

          this.scrollToSector = (sectorFeature) => {
            featureList.clearSelection();
            if(sectorFeature){
              const row = featureList.row(sectorFeature.getAttribute(objectIdField));
              if(row && row.element){
                row.element.scrollIntoView();
                featureList.select(row);
              }
            }
          };

          const generateSectorID = (index) => {
            return `${this.getCurrentCircleID()}.${(new Date()).valueOf()}`;
          };

          this.createSectorFeature = (sector, type) => {
            const sectorID = generateSectorID();
            return new Graphic({
              geometry: sector,
              attributes: {
                "circle_id": this.getCurrentCircleID(),
                "sector_id": sectorID,
                "sector_name": sectorID,
                "sector_type": type || ""
              }
            });
          };

          // DENSIFY DISTANCE //
          /*const densify_input = dom.byId("densify-input");
          on(densify_input, "change", () => {
            this.CLEAN_INFO.DENSIFY_DISTANCE = densify_input.valueAsNumber;
          });
          this.CLEAN_INFO.DENSIFY_DISTANCE = densify_input.valueAsNumber;*/

          // GENERALIZE MAX DEVIATION //
          /*const generalize_input = dom.byId("generalize-input");
          on(generalize_input, "change", () => {
            this.CLEAN_INFO.GENERALIZE_DISTANCE = generalize_input.valueAsNumber;
          });
          this.CLEAN_INFO.GENERALIZE_DISTANCE = generalize_input.valueAsNumber;*/

          /**
           *
           * @param sector
           * @returns {Polygon}
           */
          this.cleanSector = (sector) => {
            let clean_sector = geometryEngine.simplify(sector);

            clean_sector = this.removeSlivers(clean_sector);
            clean_sector = geometryEngine.simplify(clean_sector);

            // if(dom.byId("densify-chk-input").checked) {
            clean_sector = geometryEngine.densify(clean_sector, this.CLEAN_INFO.DENSIFY_DISTANCE, "meters");
            clean_sector = geometryEngine.simplify(clean_sector);
            // }

            // if(dom.byId("generalize-chk-input").checked) {
            //   clean_sector = geometryEngine.generalize(clean_sector, this.CLEAN_INFO.GENERALIZE_DISTANCE, true, "meters");
            //   clean_sector = geometryEngine.simplify(clean_sector);
            // }

            return clean_sector;
          };

          /**
           *
           * @param sector
           * @param type
           * @returns {Promise}
           */
          this.addSector = (sector, type) => {

            const sourceCircle = this.getCurrentCircle();
            const newSector = this.cleanSector(geometryEngine.intersect(sector, sourceCircle));

            const sectorFeature = this.createSectorFeature(newSector, type);
            return sectorsLayer.applyEdits({ addFeatures: [sectorFeature] }).then((editResults) => {
              console.info("addSector::applyEdits", editResults, sectorsLayer);
              return editResults.addFeatureResults[0];
            });
          };

          this.updateSectorFeature = (sectorFeature) => {
            return sectorsLayer.applyEdits({ updateFeatures: [sectorFeature] }).then((editResults) => {
              console.info("updateSectorFeature::applyEdits", editResults, sectorsLayer);
              return editResults.updateFeatureResults[0];
            });
          };

          this.removeSectorFeature = (sectorFeature) => {
            return sectorsLayer.applyEdits({ deleteFeatures: [sectorFeature] }).then((editResults) => {
              console.info("removeSectorFeature::applyEdits", editResults, sectorsLayer);
            });
          };

          this.removeSectorFeatures = () => {
            featureView.graphic = null;
            return sectorsLayer.applyEdits({ deleteFeatures: graphicsCollection.toArray() }).then((editResults) => {
              console.info("removeSectorFeatures::applyEdits", editResults, sectorsLayer);
            });
          };

          this.saveSplitOperation = (original_feature, new_features) => {
            return sectorsLayer.applyEdits({ deleteFeatures: [original_feature], addFeatures: new_features }).then((editResults) => {
              console.info("saveClipOperation::applyEdits", editResults, sectorsLayer);
            });
          };

          this.getSectionSymbol = () => {
            return sectorsLayer.renderer.symbol;
          };

        });
      });
    },

    /**
     *
     * @param sourcePolygon
     * @returns {Polygon[]}
     */
    explodePolygon: function(sourcePolygon){

      if(sourcePolygon.rings.length > 1){
        let originalPolygon = geometryEngine.simplify(sourcePolygon).clone();

        let holes = [];
        let polygons = [];
        for(let ringIndex = 0; ringIndex < originalPolygon.rings.length; ringIndex++){
          let ring = originalPolygon.rings[ringIndex];
          if(ring.length >= 3){ // IGNORE RINGS WITH LESS THAN THREE VERTICES //
            if(originalPolygon.isClockwise(ring)){
              polygons.push(new Polygon({ spatialReference: originalPolygon.spatialReference, rings: [ring] }));
            } else {
              holes.push(ring);
            }
          }
        }

        polygons.sort(function(geomA, geomB){
          return geometryEngine.planarArea(geomA, "square-meters") - geometryEngine.planarArea(geomB, "square-meters");
        });

        for(let holeIndex = 0; holeIndex < holes.length; holeIndex++){
          for(let geomIndex = 0; geomIndex < polygons.length; geomIndex++){
            if(polygons[geomIndex].contains(new Point({ spatialReference: originalPolygon.spatialReference, x: holes[holeIndex][0][0], y: holes[holeIndex][0][1] }))){
              polygons[geomIndex].addRing(holes[holeIndex]);
              break;
            }
          }
        }
        return polygons;
      } else {
        return [sourcePolygon];
      }
    },

    /**
     *
     * @param polygon
     * @returns {Polygon}
     */
    removeSlivers: function(polygon){

      const ringsAsPolygons = this.explodePolygon(polygon);
      const validRings = ringsAsPolygons.reduce((validRings, ringsAsPolygon) => {
        const areaSqMeters = geometryEngine.geodesicArea(ringsAsPolygon, this.SLIVERS_MIN_AREA_INFO.UNITS);
        console.info("removeSlivers: ", areaSqMeters);
        return validRings.concat((areaSqMeters > this.SLIVERS_MIN_AREA_INFO.AREA) ? ringsAsPolygon.rings : []);
      }, []);

      let cleanPolygon = null;
      if(validRings.length > 0){
        cleanPolygon = polygon.clone();
        cleanPolygon.rings = validRings;
      }
      return cleanPolygon;

      /*const cleanPolygon = polygon.clone();
      cleanPolygon.rings = polygon.rings.filter(ring => {
        const ringPolygon = polygon.clone();
        ringPolygon.rings = [polygon.isClockwise(ring) ? ring : ring.reverse()];
        const ringArea = geometryEngine.geodesicArea(ringPolygon, "square-meters");
        console.info("RING AREA: ", ringArea);
        return (ringArea > minArea);
      });
      return (cleanPolygon.rings.length > 0) ? cleanPolygon : null;*/
    },


    /**
     *
     * @param view
     * @param circleFeature
     */
    selectCircle: function(view, circleFeature){
      //console.info(circleFeature.attributes);

      const compilerName = `${circleFeature.getAttribute("FirstName")} ${circleFeature.getAttribute("LastName")}`;
      const circleLabel = `${circleFeature.getAttribute("Abbrev")}: ${circleFeature.getAttribute("Name")}`;
      this.updatePrintOptions(circleLabel, compilerName);

      // Comments Count_Date Description //
      dom.byId("compiler-name").value = compilerName;
      dom.byId("compiler-name").title = circleFeature.getAttribute("Comments");
      dom.byId("circle-select").title = circleFeature.getAttribute("Description");

      return this.goToFeature(circleFeature).then(() => {
        setTimeout(() => {
          this.filterByCircle(circleFeature);
          this.setCircleFeature(circleFeature);
          this.enableSketchTool(true);
        }, 500);
      });

    },

    /**
     *
     * @param view
     */
    initSketchingTool: function(view){

      let circleFeature = null;
      let sourceCircle = null;
      this.setCircleFeature = (feature) => {
        circleFeature = feature;
        sourceCircle = feature ? feature.geometry : null;
        //sourceCircle = feature ? geometryEngine.densify(feature.geometry, 25, "meters") : null;
      };
      this.getCurrentCircle = () => {
        return sourceCircle;
      };
      this.getCurrentCircleID = () => {
        return circleFeature.getAttribute(this.circleIDField)
      };

      // GOTO CIRCLE //
      on(dom.byId("sections-goto"), "click", () => {
        if(circleFeature){
          this.goToFeature(circleFeature);
        }
      });

      // CLEAR SECTIONS //
      on(dom.byId("sections-clear"), "click", () => {
        this.removeSectorFeatures();
      });


      // SKETCH SYMBOLS //
      const sketch_point_symbol = {
        type: "simple-marker",
        style: "circle",
        color: Color.named.red,
        size: "11px",
        outline: {
          type: "simple-line",
          color: Color.named.darkred,
          width: 1.5
        }
      };
      const sketch_polygon_symbol = {
        type: "simple-fill",
        color: Color.named.red.concat(0.1),
        style: "solid",
        outline: {
          type: "simple-line",
          color: Color.named.red,
          style: "dash",
          width: 1.5
        }
      };
      const sketch_polyline_symbol = sketch_polygon_symbol.outline;  //this.getSectionSymbol();

      // SKETCH VIEW MODEL //
      const sketchViewModel = new SketchViewModel({
        view: view,

        pointSymbol: sketch_point_symbol,
        polylineSymbol: sketch_polyline_symbol,
        polygonSymbol: sketch_polygon_symbol,

        activePointSymbol: sketch_point_symbol,
        activeLineSymbol: sketch_polyline_symbol,
        activeFillSymbol: sketch_polygon_symbol,
      });


      const sketchErrorLabel = domConstruct.create("div", {
        className: "panel panel-white font-size-0 text-blue icon-ui-error2 icon-ui-red hide"
      });
      view.ui.add(sketchErrorLabel, "top-right");

      this.displaySketchError = (error) => {
        dom.byId(sketchErrorLabel).innerHTML = error ? error.message : "";
        domClass.toggle(sketchErrorLabel, "hide", !error);
      };

      // const updateSketchSymbology = (invalid) => {
      //sketchViewModel.polylineSymbol = invalid ? invalid_sketch_polyline_symbol : sketch_polyline_symbol;
      //sketchViewModel.polygonSymbol = invalid ? invalid_sketch_polygon_symbol : sketch_polygon_symbol;
      // sketchViewModel.activeLineSymbol = invalid ? invalid_sketch_polyline_symbol : sketch_polyline_symbol;
      // sketchViewModel.activeFillSymbol = invalid ? invalid_sketch_polygon_symbol : sketch_polygon_symbol;
      // sketchViewModel.updatePolylineSymbol = invalid ? invalid_sketch_polyline_symbol : sketch_polyline_symbol;
      // sketchViewModel.updatePolygonSymbol = invalid ? invalid_sketch_polygon_symbol : sketch_polygon_symbol;
      // dom.byId(sketchErrorLabel).innerHTML = invalid ? "OVERLAPPING SECTORS !!!" : "";
      // domClass.toggle(sketchErrorLabel, "hide", !invalid);
      // };


      // IS SKETCHING //
      let is_sketching = false;
      this.isSketching = () => {
        return is_sketching;
      };

      // SKETCH POLYGON TOOL //
      const drawSectionTool = dom.byId("sections-draw-tool");
      // SKETCH MODE SELECT //
      const sketchModeSelect = dom.byId("sketch-mode-select");

      // SKETCH TOOL CLICK //
      on(drawSectionTool, "click", () => {
        this.enableSketchTool(false);
        this.activateSketchTool(!domClass.contains(drawSectionTool, "icon-ui-edit"));
      });

      // ENABLE SKETCH TOOL //
      this.enableSketchTool = (enabled) => {
        domClass.toggle(drawSectionTool, "btn-disabled", !enabled);
        domClass.toggle(sketchModeSelect, "btn-disabled", !enabled);
        if(!enabled){
          this.activateSketchTool(false);
        }
      };

      // ACTIVATE SKETCH TOOL //
      this.activateSketchTool = (active) => {
        //domClass.toggle(drawSectionTool, "btn-clear", !active);
        domClass.toggle(drawSectionTool, "icon-ui-edit", active);
        domClass.toggle(sketchModeSelect, "btn-disabled", active);

        view.container.style.cursor = active ? "crosshair" : "default";
        if(active){
          //const sectorPolygons = this.getSectorPolygons();

          this.toggleSectorsLayerPopup(false);
          sketchViewModel.create("polygon", { mode: sketchModeSelect.value });
          view.focus();

          key_down_handle && key_down_handle.remove();
          key_down_handle = view.on("key-down", (evt) => {
            if(evt.key.startsWith("Esc")){
              key_down_handle.remove();
              sketchViewModel.reset();
            }
          });

          /*const draw_action = sketchViewModel.draw.activeAction;
          draw_action.on("cursor-update", (evt) => {
            const sketch = new Polygon({
              spatialReference: view.spatialReference,
              rings: evt.vertices
            });
            const has_intersection = sectorPolygons.some((sectorPolygon) => {
              return geometryEngine.intersects(sectorPolygon, sketch);
            });
            updateSketchSymbology(has_intersection);
          });*/

        } else {
          sketchViewModel.reset();
        }
      };

      let key_down_handle = null;

      //
      // DRAW //
      //
      sketchViewModel.on("draw-start", (draw_start_evt) => {
        is_sketching = true;
        this.enableViewClickEvents(false);
        //updateSketchSymbology(false);

        key_down_handle && key_down_handle.remove();
        key_down_handle = view.on("key-down", (evt) => {
          if(evt.key.startsWith("Esc")){
            key_down_handle.remove();
            sketchViewModel.reset();
          }
        });
      });

      sketchViewModel.on("draw-cancel", (draw_cancel_evt) => {
        is_sketching = false;
        this.enableViewClickEvents(true);
        //updateSketchSymbology(false);
        this.enableSketchTool(true);
      });


      // SKETCH POLYGON COMPLETE //
      sketchViewModel.on("draw-complete", (draw_complete_evt) => {
        is_sketching = false;
        this.enableViewClickEvents(true);
        //updateSketchSymbology(false);

        let newSector = draw_complete_evt.geometry;

        if(geometryEngine.intersects(draw_complete_evt.geometry, sourceCircle)){
          this.addSector(newSector, "sketch").always((addFeatureResult) => {
            this.enableSketchTool(true);
            const feature_added_handle = this.on("sector-feature-added", (evt) => {
              if(evt.oid === addFeatureResult.objectId){
                feature_added_handle.remove();
                this.highlightSector(evt.feature, true);
                this.activateSketchTool(false);
              }
            });
          });
        } else {
          query(".invalid-message").addClass("hide");
          domClass.remove("outside-sketch", "hide");
          calcite.bus.emit("modal:open", { id: "invalid-sketch-dialog" });
          this.enableSketchTool(true);
        }

      });

      // DENSIFY //
      const densifyBtn = dom.byId("densify-points-btn");
      on(densifyBtn, "click", () => {
        if(selected_feature){

          selected_feature.geometry = geometryEngine.densify(selected_feature.geometry.clone(), this.CLEAN_INFO.DENSIFY_DISTANCE, "meters");

          this.updateSectorFeature(selected_feature).then((updateFeatureResult) => {
            const feature_added_handle = this.on("sector-feature-added", (evt) => {
              if(evt.oid === updateFeatureResult.objectId){
                feature_added_handle.remove();
                this.highlightSector(evt.feature, true);
              }
            });
          });

        }
      });


      //
      // SPLIT //
      //
      const cutter_point_symbol = {
        type: "simple-marker",
        style: "circle",
        color: Color.named.lime,
        size: "11px",
        outline: {
          color: Color.named.darkgreen,
          width: 1.5
        }
      };
      const cutter_polyline_symbol = {
        type: "simple-line",
        style: "dash",
        color: Color.named.limegreen,
        width: 1.5
      };
      const splitSketchViewModel = new SketchViewModel({
        view: view,
        pointSymbol: cutter_point_symbol,
        polylineSymbol: cutter_polyline_symbol,
        activeLineSymbol: cutter_polyline_symbol,
      });
      splitSketchViewModel.on("draw-complete", (draw_complete_evt) => {
        const split_results = geometryEngine.cut(selected_feature.geometry, draw_complete_evt.geometry);
        if(split_results.length > 0){
          const split_features = split_results.map(split_result => {
            return this.createSectorFeature(split_result, "split");
          });
          this.saveSplitOperation(selected_feature, split_features).then(() => {
            /* success */
            domClass.remove(splitSectorBtn, "btn-disabled");
          });
        } else {
          /* invalid cutter */
          domClass.remove(splitSectorBtn, "btn-disabled");
          this.displaySketchError(new Error("Invalid split line..."));
        }
      });
      splitSketchViewModel.on("draw-cancel", (draw_cancel_evt) => {
        this.displaySketchError();
        domClass.remove(splitSectorBtn, "btn-disabled");
      });

      const splitSectorBtn = dom.byId("split-sector-tool");
      on(splitSectorBtn, "click", () => {
        this.displaySketchError();
        if(selected_feature){
          domClass.add(splitSectorBtn, "btn-disabled");
          splitSketchViewModel.create("polyline", { mode: sketchModeSelect.value });
          view.focus();

          key_down_handle && key_down_handle.remove();
          key_down_handle = view.on("key-down", (evt) => {
            if(evt.key.startsWith("Esc")){
              key_down_handle.remove();
              splitSketchViewModel.reset();
            }
          });

        } else {
          /* no selected feature */
        }
      });


      //
      // CLIP
      //
      const clipSectorBtn = dom.byId("clip-sector-tool");
      on(clipSectorBtn, "click", () => {
        if(selected_feature){

          const selected_sector = selected_feature.geometry.clone();

          const sectorPolygons = this.filterSectorPolygons(selected_feature);
          const intersecting_sectors = sectorPolygons.filter((sectorPolygon) => {
            return geometryEngine.intersects(sectorPolygon, selected_sector);
          });
          if(intersecting_sectors.length > 0){
            const clipped_sector = intersecting_sectors.reduce((updated_sector, intersecting_sector) => {
              if(updated_sector){
                updated_sector = this.cleanSector(geometryEngine.difference(updated_sector.clone(), intersecting_sector));
              }
              return updated_sector;
            }, selected_sector);
            if(clipped_sector){

              selected_feature.geometry = clipped_sector;
              selected_feature.setAttribute("sector_type", "clip");
              this.updateSectorFeature(selected_feature).then((updateFeatureResult) => {
                /*  success */

                const feature_added_handle = this.on("sector-feature-added", (evt) => {
                  if(evt.oid === updateFeatureResult.objectId){
                    feature_added_handle.remove();
                    this.highlightSector(evt.feature, true);
                  }
                });

              });
            } else {
              /* no geometry left after all the difference calls */
              this.displaySketchError(new Error("Invalid split line..."));
            }
          } else {
            /*  no intersecting sectors */
            this.displaySketchError(new Error("No intersecting sectors..."));
          }
        } else {
          /* no selected feature */
          this.displaySketchError(new Error("No selected sector..."));
        }
      });


      // UPDATE SKETCH VIEW MODEL //
      const updateSketchViewModel = new SketchViewModel({
        view: view,

        vertexSymbol: {
          type: "simple-marker",
          style: "circle",
          color: Color.named.salmon,
          size: "7px",
          outline: {
            type: "simple-line",
            color: Color.named.darkred,
            width: 1.0
          }
        },
        hoverVertexSymbol: {
          type: "simple-marker",
          style: "circle",
          color: Color.named.red,
          size: "13px",
          outline: {
            type: "simple-line",
            color: Color.named.darkred,
            width: 1.0
          }
        },
        selectedVertexSymbol: {
          type: "simple-marker",
          style: "cross",
          color: Color.named.red,
          size: "17px",
          outline: {
            type: "simple-line",
            color: Color.named.darkred,
            width: 2.5
          }
        },

        updatePointSymbol: sketch_point_symbol,
        updatePolylineSymbol: sketch_polyline_symbol,
        updatePolygonSymbol: sketch_polygon_symbol
      });

      //
      // UPDATE //
      //
      let selected_feature = null;
      const updateSectorBtn = dom.byId("update-sector-btn");
      on(updateSectorBtn, "click", () => {
        this.startFeatureUpdate(selected_feature);
      });
      this.on("feature-selected", (evt) => {
        selected_feature = evt.feature;
        domClass.toggle(updateSectorBtn, "btn-disabled", !selected_feature);
        domClass.toggle(splitSectorBtn, "btn-disabled", !selected_feature);
        domClass.toggle(clipSectorBtn, "btn-disabled", !selected_feature);
        domClass.toggle(densifyBtn, "btn-disabled", !selected_feature);
      });


      let edit_feature = null;
      let edit_layer = null;
      let edit_definition_expression = null;

      this.startFeatureUpdate = (feature) => {
        is_sketching = true;
        this.enableViewClickEvents(false);
        //updateSketchSymbology(false);

        edit_feature = feature;
        edit_layer = edit_feature.layer;
        edit_definition_expression = edit_layer.definitionExpression;
        edit_layer.definitionExpression += ` AND (${edit_layer.objectIdField} <> ${edit_feature.getAttribute(edit_layer.objectIdField)})`;

        updateSketchViewModel.update(edit_feature.geometry);
        view.focus();

        key_down_handle && key_down_handle.remove();
        key_down_handle = view.on("key-down", (evt) => {
          if(evt.key.startsWith("Esc")){
            key_down_handle.remove();
            updateSketchViewModel.reset();
          }
        });
      };

      this.stopFeatureUpdate = () => {
        //updateSketchSymbology(false);
        edit_layer.definitionExpression = edit_definition_expression;
        edit_layer = null;
        edit_feature = null;
        is_sketching = false;
        this.enableViewClickEvents(true);
        domClass.add(updateSectorBtn, "btn-disabled");
        domClass.add(splitSectorBtn, "btn-disabled");
        domClass.add(clipSectorBtn, "btn-disabled");
        domClass.add(densifyBtn, "btn-disabled");
      };

      updateSketchViewModel.on("update-start", (update_start_evt) => {
        is_sketching = true;
        this.enableViewClickEvents(false);

        /*const sectorPolygons = this.filterSectorPolygons(edit_feature);
        updateSketchViewModel._graphics.on("graphic-update", (evt) => {
          const has_intersection = sectorPolygons.some((sectorPolygon) => {
            return geometryEngine.intersects(sectorPolygon, evt.graphic.geometry);
          });
          updateSketchSymbology(has_intersection);
        });*/

        key_down_handle && key_down_handle.remove();
        key_down_handle = view.on("key-down", (evt) => {
          if(evt.key.startsWith("Esc")){
            key_down_handle.remove();
            updateSketchViewModel.reset();
          }
        });
      });

      updateSketchViewModel.on("update-cancel", (update_cancel_evt) => {
        const oid = edit_feature.getAttribute(edit_layer.objectIdField);
        this.stopFeatureUpdate();
        this.enableSketchTool(true);

        const feature_added_handle = this.on("sector-feature-added", (evt) => {
          if(evt.oid === oid){
            feature_added_handle.remove();
            this.highlightSector(evt.feature, true);
          }
        });

      });

      updateSketchViewModel.on("update-complete", (update_complete_evt) => {
        if(edit_feature){
          if(geometryEngine.intersects(update_complete_evt.geometry, sourceCircle)){
            const sector = update_complete_evt.geometry.clone();

            const sourceCircle = this.getCurrentCircle();
            edit_feature.geometry = geometryEngine.simplify(geometryEngine.intersect(sector, sourceCircle));
            //edit_feature.geometry = this.cleanSector(geometryEngine.intersect(sector, sourceCircle));

            this.updateSectorFeature(edit_feature).then((updateFeatureResult) => {
              this.stopFeatureUpdate();
              this.enableSketchTool(true);
              const feature_added_handle = this.on("sector-feature-added", (evt) => {
                if(evt.oid === updateFeatureResult.objectId){
                  feature_added_handle.remove();
                  this.highlightSector(evt.feature, true);
                }
              });
            });

          } else {
            query(".invalid-message").addClass("hide");
            domClass.remove("outside-sketch", "hide");
            calcite.bus.emit("modal:open", { id: "invalid-sketch-dialog" });
            this.stopFeatureUpdate();
            this.enableSketchTool(true);
          }
        }
      });

    }

  });
});
