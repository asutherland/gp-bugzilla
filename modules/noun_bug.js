/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is gp-bugzilla.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Messaging, Inc.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Andrew Sutherland <asutherland@asutherland.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

EXPORTED_SYMBOLS = ['Bug', 'BugNoun', 'BugAttachment', 'BugAttachmentNoun',
                    'BugRequestActionNoun',
                    'kBugRequest_Asked', 'kBugRequest_Granted',
                    'kBugRequest_Denied'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://app/modules/gloda/log4moz.js");
Cu.import("resource://app/modules/StringBundle.js");

Cu.import("resource://app/modules/gloda/public.js");

const bugStrings =
  new StringBundle("chrome://gpbugzilla/locale/gpbugzilla.properties");

/**
 * Represents a bug.
 * We actually don't need this class for our current functionality, but at some
 *  point we will issue requests against the server to flesh out our knowledge
 *  about the bug.  And then this will be handy.
 */
function Bug(aNumber) {
  this._number = aNumber;
}

Bug.prototype = {
  get number() { return this._number; },

  toString: function() {
    return "Bug " + this._number;
  },
  toLocaleString: function() {
    return bugStrings.get("bugNumber", [this._number]);
  }
};

let BugNoun = {
  name: "bug",
  clazz: Bug,
  allowsArbitraryAttrs: false,

  equals: function gp_bug_noun_equals(aBug, bBug) {
    return aBug.number == bBug.number;
  },
  comparator: function gp_bug_noun_comparator(a, b) {
    if (a == null) {
      if (b == null)
        return 0;
      else
        return 1;
    }
    else if (b == null) {
      return -1;
    }
    return a.number - b.number;
  },

  toJSON: function gp_bug_noun_toJSON(aBug) {
    return aBug.number;
  },
  toParamAndValue: function gp_bug_noun_toParamAndValue(aBug) {
    return [null, aBug.number];
  },
  fromJSON: function gp_bug_noun_fromJSON(aBugNumber) {
    return new Bug(aBugNumber);
  }
};

/**
 * Represents a bug attachment.
 * We don't actually need this class for our current functionality, but it
 *  could be useful to have this be its own object in the future.
 */
function BugAttachment(aAttachmentNumber) {
  this._attachmentNumber = aAttachmentNumber;
}

BugAttachment.prototype = {
  get attachmentNumber() { return this._attachmentNumber; },
  toString: function() {
    return "Attachment " + this._attachmentNumber;
  },
  toLocaleString: function() {
    return bugStrings.get("attachmentNumber", [this._attachmentNumber]);
  }
};

let BugAttachmentNoun = {
  name: "bug-attachment",
  clazz: BugAttachment,
  allowsArbitraryAttrs: false,

  equals: function gp_bug_noun_equals(aBugAttachment, bBugAttachment) {
    return aBugAttachment.attachmentNumber == bBugAttachment.attachmentNumber;
  },
  comparator: function gp_bug_noun_comparator(a, b) {
    if (a == null) {
      if (b == null)
        return 0;
      else
        return 1;
    }
    else if (b == null) {
      return -1;
    }
    return a._attachmentNumber - b._attachmentNumber;
  },

  toJSON: function gp_bug_noun_toJSON(aBugAttachment) {
    return aBugAttachment.attachmentNumber;
  },
  toParamAndValue: function gp_bug_noun_toParamAndValue(aBugAttachment) {
    return [null, aBugAttachment.number];
  },
  fromJSON: function gp_bug_noun_fromJSON(aBugAttachmentNumber) {
    return new BugAttachment(aBugAttachmentNumber);
  }
};

const kBugRequest_Asked = 1;
const kBugRequest_Granted = 2;
const kBugRequest_Denied = 3;

const bugRequestStringMap = {
  1: bugStrings.get("bugRequest.asked"),
  2: bugStrings.get("bugRequest.granted"),
  3: bugStrings.get("bugRequest.denied"),
};

let BugRequestActionNoun = {
  name: "bug-request-action",
  clazz: Number,
  allowsArbitraryAttrs: false,

  userVisibleString: function(aVal) {
    return bugRequestStringMap[aVal];
  },

  comparator: function gp_bug_noun_comparator(a, b) {
    if (a == null) {
      if (b == null)
        return 0;
      else
        return 1;
    }
    else if (b == null) {
      return -1;
    }
    return a - b;
  },

  // we don't need toJSON/fromJSON for numbers...
  toParamAndValue: function gp_bug_noun_toParamAndValue(aBugRequestVal) {
    return [null, aBugRequestVal];
  },
};

Gloda.defineNoun(BugNoun);
Gloda.defineNoun(BugAttachmentNoun);
Gloda.defineNoun(BugRequestActionNoun);
