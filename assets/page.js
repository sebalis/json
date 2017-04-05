
var excerptRows = 7;
var input;
var url;
var lastSaved;

// function log(msg) {
//   return $(".console").removeClass("error").html(msg);
// }

// function error(msg) {
//   return log(msg).addClass("error");
// }

function doJSON() {
  // just in case
  $(".drop").hide();

  // get input JSON, try to parse it
  var newInput = $(".json textarea").val();
  if (newInput == input) return;

  // wipe result
  $(".csv textarea").val("");
  input = newInput;
  if (!input) {
    // wipe the rendered version too
    $(".json code").html("");
	$(".tree").hide();
    return;
  }

  var json = jsonFrom(input);
  var tree = treeFrom(json);

  // if succeeded, prettify and highlight it
  // highlight shows when textarea loses focus
  if (tree) {
    // Reset any error message from previous failed parses.
    $("div.error").hide();
    $("div.warning").show();

    var pretty = JSON.stringify(json, undefined, 2);
    $(".json code").html(pretty);
    if (pretty.length < (50 * 1024))
      hljs.highlightBlock($(".json code").get(0));

    // convert to CSV, make available
    if (isLeaf(tree)) {
        $(".tree").hide();
        doCSV(tree);
    } else {
        doTree(tree);
        $(".csv .rendered").hide();
        $(".csv .editing").show();
        $(".tree").show();
    }
  } else {
    // Show error.
    $("div.warning").hide();
    $("div.error").show();
    $(".tree").hide();
    $(".csv .rendered").hide();
    $(".csv .editing").show();
    $(".json code").html("");
  }

  // Either way, update the error-reporting link to include the latest.
  setErrorReporting(null, input);

  return true;
}

// show rendered JSON
function showJSON(rendered) {
  console.log("ordered to show JSON: " + rendered);
  if (rendered) {
    if ($(".json code").html()) {
      console.log("there's code to show, showing...");
      $(".json .rendered").show();
      $(".json .editing").hide();
    }
  } else {
    $(".json .rendered").hide();
    $(".json .editing").show().focus();
  }
}

function showCSV(rendered) {
  if (rendered) {
    if ($(".csv table").html()) {
      $(".csv .rendered").show();
      $(".csv .editing").hide();
    }
  } else {
    $(".csv .rendered").hide();
    $(".csv .editing").show().focus();
  }
}

// takes an array of flat JSON objects, converts them to arrays
// renders them into a small table as an example
function renderCSV(objects) {
  var rows = $.csv.fromObjects(objects, {justArrays: true});
  if (rows.length < 1) return;

  // find CSV table
  var table = $(".csv table")[0];
  $(table).html("");

  // render header row
  var thead = document.createElement("thead");
  var tr = document.createElement("tr");
  var header = rows[0];
  for (field in header) {
    var th = document.createElement("th");
    $(th).html(header[field])
    tr.appendChild(th);
  }
  thead.appendChild(tr);

  // render body of table
  var tbody = document.createElement("tbody");
  for (var i=1; i<rows.length; i++) {
    tr = document.createElement("tr");
    for (field in rows[i]) {
      var td = document.createElement("td");
      $(td)
        .html(rows[i][field])
        .attr("title", rows[i][field]);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
}

function doCSV(inArray) {
  // turn the tabular object into a CSV row using jquery-csv
  var outArray = [];
  for (var row in inArray)
      outArray[outArray.length] = parse_object(inArray[row]);

  $("span.rows.count").text("" + outArray.length);

  var csv = $.csv.fromObjects(outArray);
  // excerpt and render first 10 rows
  renderCSV(outArray.slice(0, excerptRows));
  showCSV(true);

  // show raw data if people really want it
  $(".csv textarea").val(csv);

  // download link to entire CSV as data
  // thanks to https://jsfiddle.net/terryyounghk/KPEGU/
  // and https://stackoverflow.com/questions/14964035/how-to-export-javascript-array-info-to-csv-on-client-side
  var uri = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  $(".csv a.download").attr("href", uri);
}

// loads original pasted JSON from textarea, saves to anonymous gist
// rate-limiting means this could easily fail with a 403.
function saveJSON() {
  if (!input) return false;
  if (input == lastSaved) return false;

  // save a permalink to an anonymous gist
  var gist = {
    description: "test",
    public: false,
    files: {
      "source.json": {
          "content": input
      }
    }
  };

  // TODO: show spinner/msg while this happens

  console.log("Saving to an anonymous gist...");
  $.post(
    'https://api.github.com/gists',
    JSON.stringify(gist)
  ).done(function(data, status, xhr) {

    // take new Gist id, make permalink
    setPermalink(data.id);

    // send analytics event
    Events.permalink();

    // mark what we last saved
    lastSaved = input;

    // update error-reporting link, including permalink
    setErrorReporting(data.id, input);

    console.log("Remaining this hour: " + xhr.getResponseHeader("X-RateLimit-Remaining"));

  }).fail(function(xhr, status, errorThrown) {
    console.log(xhr);

    // send analytics event
    Events.permalink_error(status);

    // TODO: gracefully handle rate limit errors
    // if (status == 403)

    // TODO: show when saving will be available
    // e.g. "try again in 5 minutes"
    // var reset = xhr.getResponseHeader("X-RateLimit-Reset");
    // var date = new Date();
    // date.setTime(parseInt(reset) * 1000);
    // use http://momentjs.com/ to say "in _ minutes"

  });

  return false;
}

// Updates the error-reporting link to include current details.
//
// If the passed-in `id` is not null, a permalink is included.
// If the passed-in `id` is null, then no permalink is included.
// (Needed explicitly because the current URL doesn't always refer
// to a permalink related to the current value of the textarea.)
//
// The current body of the textarea will be encoded into the URI,
// to pre-populate the GitHub issue template, but only if the body
// is < 7KB (7,168). GitHub's nginx server rejects query strings
// longer than ~8KB.
//
// If no `id` is given, and content is too long, the URL will
// encode only a title, and no body.
function setErrorReporting(id, content) {
  var base = "https://github.com/konklone/json/issues/new";

  var title = "Error parsing some specific JSON";

  var body = "I'm having an issue converting this JSON:\n\n";
  if (id) body += (
    window.location.protocol + "//" +
    window.location.host + window.location.pathname +
    "?id=" + id + "\n\n"
  );

  if (content.length <= (7 * 1024))
    body += ("```json\n" + content + "\n```");

  var finalUrl = base + "?title=" + encodeURIComponent(title) +
    "&body=" + encodeURIComponent(body);

  $(".error a.report").attr("href", finalUrl);

  // console.log("Updated error reporting link to:" + finalUrl);
  return true;
}

// given a valid gist ID, set the permalink to use it
function setPermalink(id) {
  if (history && history.pushState)
    history.pushState({id: id}, null, "?id=" + id);

  // log("Permalink created! (Copy from the location bar.)")
}

// check query string for gist ID
function loadPermalink() {
  var id = getParam("id");
  if (!id) return;

  $.get('https://api.github.com/gists/' + id,
    function(data, status, xhr) {
      console.log("Remaining this hour: " + xhr.getResponseHeader("X-RateLimit-Remaining"));

      var input = data.files["source.json"].content;
      $(".json textarea").val(input);
      doJSON();
      showJSON(true);
    }
  ).fail(function(xhr, status, errorThrown) {
    console.log("Error fetching anonymous gist!");
    console.log(xhr);
    console.log(status);
    console.log(errorThrown);
  });
}

function doTree(tree) {
  var display = $(".tree .display");
  display.html("");
  var root = $("<div/>").appendTo(display);
  var list = addNodes(tree, root);
  root.toggleClass("open");
}

function addNodes(root, container) {
  var list = $('<ol/>').appendTo(container);
  for (var key in root) {
    var node = root[key];
    var item = $('<li/>').appendTo(list);
    var indicator = $('<span class="indicator"/>').appendTo(item);
    var link = $('<a href="#"/>').appendTo(item);
    $('<span class="name"/>').text(key).appendTo(link);
    if (isLeaf(node)) {
      item.addClass("leaf");
	  (function (node) {
      	link.on("click", function (event) { doCSV(node); event.preventDefault(); });
	  })(node);
    } else {
      item.addClass("node");
	  (function (item, link, indicator) {
      	link.on("click", function (event) { item.toggleClass("open"); link.blur(); event.preventDefault(); });
      	indicator.on("click", function (event) { item.toggleClass("open"); event.preventDefault(); });
	  })(item, link, indicator);
      addNodes(node, item);
    }
  }
  return list;
}

$(function() {

  $(".json textarea").blur(function() {showJSON(true);});
  $(".json pre").click(function() {showJSON(false)});
  $(".csv textarea").blur(function() {showCSV(true);})
  $(".csv .raw").click(function() {
    showCSV(false);
    $(".csv textarea").focus().select();
    return false;
  })

  // if there's no CSV to download, don't download anything.
  // also, log an analytics event.
  $(".csv a.download").click(function() {
    var data = $(".csv textarea").val();
    if (data) {
      Events.download(data.length);
      return true;
    } else
      return false;
  });

  // Both elements are present on page-load, so use normal click handler.
  $(".save a, .error a.save").click(saveJSON);

  // transform the JSON whenever it's pasted/edited
  $(".json textarea")
    .on('paste', function() {
      // delay the showing so the paste is pasted by then
      setTimeout(function() {
        doJSON();
        $(".json textarea").blur();
      }, 1);
    })
    .keyup(doJSON); // harmless to repeat doJSON

  // go away
  $("body").click(function() {
    $(".drop").hide();
  });

  $(document)
    .on("dragenter", function(e) {
      e.preventDefault();
      e.stopPropagation();
      $(".drop").show();
    })
    .on("dragover", function(e) {
      e.preventDefault();
      e.stopPropagation();
    })
    .on("dragend", function(e) {
      e.preventDefault();
      e.stopPropagation();
      $(".drop").hide();
    })
    .on("drop", function(e) {
      $(".drop").hide();

      if (e.originalEvent.dataTransfer) {
        if (e.originalEvent.dataTransfer.files.length) {
          e.preventDefault();
          e.stopPropagation();

          var reader = new FileReader();

          reader.onload = function(ev) {
            console.log(ev.target.result);
            $(".json textarea").val(ev.target.result);

            setTimeout(function() {
              doJSON();
              $(".json textarea").blur();
            }, 1);
          }

          reader.readAsText(e.originalEvent.dataTransfer.files[0]);
        }
      }
    });

  // highlight CSV on click
  $(".csv textarea").click(function() {$(this).focus().select();});

  // initialize
  loadPermalink();
  $(".json .editing").trigger("keyup");
});

