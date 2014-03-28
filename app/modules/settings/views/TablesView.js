//  tables.js
//  Directus 6.0

//  (c) RANGER
//  Directus may be freely distributed under the GNU license.
//  For all details and documentation:
//  http://www.getdirectus.com


define([
  'app',
  'backbone',
  'core/directus',
  'core/BasePageView',
  'schema/ColumnModel',
  'core/UIManager',
  'jquery-ui'

],

function(app, Backbone, Directus, BasePageView, ColumnModel, UIManager) {

  "use strict";

  var SettingsTables = app.module();

  // Handles new columns and aliases.
  // Rendered inside modal
  var NewColumn = Backbone.Layout.extend({

    tagName: 'div',

    template: 'modules/settings/settings-columns-add',

    attributes: {'class':'form'},

    events: {
      'change select': function(e) {
        var data = this.$el.serializeObject();
        this.model.clear({silent: true});
        this.model.set(data);
      }
    },

    serialize: function() {
/*      options = {};
      options.types = _.chain(app.router.uiSettings)
        .filter(function(ui) { return (!ui.system); })
        .map(function(ui) { return {id: ui.id, datatype: ui.dataTypes[0]}; })
        .value();*/

      var tables = app.schemaManager.getTables();
      var options = {data: this.model.toJSON()};
      var dataType = this.model.get('data_type');
      var tableRelated = this.model.relationship.get('table_related');

      if (dataType !== undefined) {
        options[dataType] = true;
        if (['ONETOMANY','MANYTOMANY','ALIAS'].indexOf(dataType) > -1) {
          options.directusType = true;
        }
      }
      if (tableRelated !== undefined) {
        options.columns = app.schemaManager.getColumns(tableRelated).map(function(model) {
          return {column_name: model.id, selected: (model.id === this.model.relationship.get('junction_key_right'))};
        }, this);
      }
      if (dataType === 'MANYTOMANY') {
        options.junctionTables = tables.chain()
          .filter(function(model) { return model.get('is_junction_table'); })
          .map(function(model) { return {id: model.id, selected: (model.id === this.model.get('junction_table'))}; }, this)
          .value();
      }

      options.tables = tables.map(function(model) {
        return {id: model.get('table_name'), is_junction_table: model.get('is_junction_table') ,selected: (model.id === this.model.relationship.get('table_related'))};
      },this);

      return options;
    },

    initialize: function() {
      this.model.on('change', this.render, this);
    }

  });

  //
  var Columns = Backbone.Layout.extend({

    tagName: 'form',

    template: 'modules/settings/settings-columns',

    events: {
      'click button[data-action=ui]': 'editUI',
      'change select,input': 'bindForm',
      'click button[data-action=new-field]': 'newField'
    },

    newField: function(e) {
      var collection = this.collection;
      //@todo: link real col
      var model = new ColumnModel({'data_type':'ALIAS','ui':{}}, {collection: this.collection});
      var view = new NewColumn({model: model});
      var modal = app.router.openModal(view, {title: 'Add new column', stretch: true});
      view.render();
      modal.save = function() {
        var data = view.$el.serializeObject();
        model.clear({silent: true});
        model.save(data,{success: function() {
          modal.close();
          collection.add(model);
          collection.trigger('change');
        }});
      };
    },

    // Updates the models when user interacts with the form.
    bindForm: function(e) {
      var id = e.target.getAttribute('data-id');
      var attr = e.target.name;
      var value = e.target.value;
      var model = this.collection.get(id);
      var data = {};

      if (e.target.type === 'checkbox' || e.target.type === 'radio') {
        value = $(e.target).is(':checked') ? 1 : 0;
      }

      //Unset previous master
      if (attr === 'master') {
        var master = this.collection.where({master: true});
        if (master.length) {
          master[0].set({master: false}, {silent: true});
        }
      }

      data[attr] = value;

      model.set(data);

      console.log(model);
    },

    sort: function() {
      var collection = this.collection;
      this.$el.find('tbody > tr').each(function(i) {
        var model = collection.get(this.getAttribute('data-id'));
        model.set({sort: i}, {silent: true});
        //console.log(model.id, {sort: i});
      });
      //collection.trigger('change');
      collection.sort();
    },

    editUI: function(e) {
      var id = e.target.getAttribute('data-id');
      var column = this.collection.get(id);
      var model = column.options;
      var schema = app.schemaManager.getColumns('ui', model.id);
      var view = new Directus.EditView({model: model, structure: schema});
      var modal = app.router.openModal(view, {title: 'UI Settings', stretch: true});
      modal.save = function() {
        model.save(view.data(), {success: function() {
          modal.close();
        }});
      };
      model.fetch();
    },

    serialize: function() {
      var ui = UIManager.getAllSettings({returnObject: true});

      var rows = this.collection.map(function(model) {
        var row = model.toJSON();

        if (row.is_nullable === "NO") {
          row.required = true;
          row.requiredDisabled = true;
        }

        row.uiHasVariables = ui.hasOwnProperty(row.ui) && ui[row.ui].hasOwnProperty('variables');

        row.alias = ['ALIAS','ONETOMANY','MANYTOMANY'].indexOf(row.type) > -1;
        row.types = [];
        row.relationship = "";

        var validation = model.options.validate(model.options.toJSON());

        row.valid = true;
        if (validation !== undefined) {
          row.valid = false;
        }

        switch (model.getRelationshipType()) {
          case 'ONETOMANY':
            row.relationship = "⊣";
            row.relationshipTooltip = model.getRelated();
            break;
          case 'MANYTOONE':
            row.relationship = "⊢";
            row.relationshipTooltip = model.getRelated();
            break;
          case 'MANYTOMANY':
            row.relationship = "⊢⊣";
            row.relationshipTooltip = model.getRelated();
            break;
        }
        // Gather a list of UI alternatives
        _.each(ui, function(ui) {
          if (!ui.system && ui.dataTypes.indexOf(row.type) > -1) {
            row.types.push({id: ui.id, isActive: (ui.id === row.ui)});
          }
        });
        return row;
      });
      return {rows: rows};
    },

    afterRender: function() {
      this.$el.find('tbody').sortable({
        stop: _.bind(this.sort, this),
        axis: "y",
        handle: '.sort'
      });

    },

    initialize: function() {
      this.collection.on('change sync sort', this.render, this);
    }

  });

  var TableModule = Backbone.Layout.extend({
    template: 'modules/settings/module-table-settings',
    attributes: {'class': 'directus-module'},
    serialize: function() {
      return {
        hidden: this.model.get('hidden'),
        single: this.model.get('single'),
        inactive_by_default: this.model.get('inactive_by_default'),
        is_junction_table: this.model.get('is_junction_table'),
        footer: this.model.get('footer')
      };
    }
  });

  SettingsTables.Views.Table = BasePageView.extend({
    headerOptions: {
      route: {
        title: 'Classes',
        breadcrumbs: [{title: 'Settings', anchor: '#settings'}, {title: 'Tables+Inputs', anchor: '#settings/tables'}]
      }
    },

    events: {
      'click #save-form': 'saveColumns'
    },

    saveColumns: function(e) {
      var data = {};

      //Take care of the checkboxes
      $('#table-settings').find('input[type=checkbox]:not(:checked)').each(function(){
        data[this.name] = 0;
      }).get();

      data = _.extend(data, $('#table-settings').serializeObject());

      this.model.save(data, {success: function(){
        app.router.go('settings','tables');
      }});
    },

    serialize: function() {
      var data = {
        title: this.model.id,
        breadcrumbs: [{title: 'Settings', anchor: '#settings'}, {title: 'Tables', anchor: '#settings/tables'}],
        sidebar: true
      };
      return data;
    },

    beforeRender: function() {
      BasePageView.prototype.beforeRender.call(this);
    },

    afterRender: function() {
      this.setView('#page-content', this.columns);
      this.collection.fetch();
    },

    initialize: function() {
      this.collection = this.model.columns;
      this.columns = new Columns({collection: this.collection});
      //this.collection.on('change', this.render, this);
    }
  });

  var Tables = Backbone.Layout.extend({

    template: 'modules/settings/settings-tables',

    events: {
      'click td': function(e) {
        var tableName = $(e.target).closest('tr').attr('data-id');
        app.router.go(['settings','tables',tableName]);
      }
    },

    serialize: function() {

      var rows = this.collection.filter(function(model) {

        //Filter out _directus tables
        if (model.id.substring(0,9) === 'directus_') return false;

        //Filter out tables you don't have alter permissions on
        var privileges = app.schemaManager.getPrivileges(model.id);

        // filter out tables with empty privileges
        if (privileges === undefined) return false;

        var permissions = privileges.get('permissions').split(',');

        // only return tables with view permissions
        return _.contains(permissions, 'alter');
      });

      rows = _.map(rows, function(model) { return model.toJSON(); });
      return {rows: rows};
    }

  });

  SettingsTables.Views.List = BasePageView.extend({
    headerOptions: {
      route: {
        title: 'Tables+Inputs',
        breadcrumbs: [{title: 'Settings', anchor: '#settings'}]
      },
    },

    beforeRender: function() {
      this.setView('#page-content', new Tables({collection: this.collection}));
      BasePageView.prototype.beforeRender.call(this);
    }
  });

  return SettingsTables;

});