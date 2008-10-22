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

EXPORTED_SYMBOLS = [''];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gloda/modules/log4moz.js");

Cu.import("resource://gloda/modules/public.js");

Cu.import("resource://gpbugzilla/modules/noun_bug.js");


const EXT_NAME = "gp-bugzilla";

let BugzillaAttr = {
  providerName: EXT_NAME,
  _log: null,
  _bugRegex: null,
  _bugLinkRegex: null,
  _attrIsBug: null,
  _attrReferencesBug: null,

  init: function() {
    this._log =  Log4Moz.Service.getLogger("gpbugzilla.attr_bug");
    this._bugRegex = new RegExp("bug {1,2}#?(\\d{4,7})", "gi");
    this._bugLinkRegex = new RegExp(
      "https://bugzilla\\.mozilla\\.org/show_bug\\.cgi\\?id=(\\d{4,7})", "gi");
    this._bugSubjectRegex = new RegExp("^\\[Bug (\\d{4,7})\\]");
    this._changedRegex = new RegExp("^([^<\\n]+<[^>\\n]+>) changed:$", "m");
    
    this.defineAttributes();
  },

  defineAttributes: function() {
    this._attrReferencesBug = Gloda.defineAttribute({
      provider: this,
      extensionName: EXT_NAME,
      attributeType: Gloda.kAttrDerived,
      attributeName: "bugsReferenced",
      singular: false,
      subjectNouns: [Gloda.NOUN_MESSAGE],
      objectNoun: Gloda.lookupNoun("bug"),
      parameterNoun: null,
      });
    this._attrIsBug = Gloda.defineAttribute({
      provider: this,
      extensionName: EXT_NAME,
      attributeType: Gloda.kAttrDerived,
      attributeName: "bug",
      singular: true,
      subjectNouns: [Gloda.NOUN_MESSAGE],
      objectNoun: Gloda.lookupNoun("bug"),
      parameterNoun: null,
      });
  },
  
  process: function gp_bug_attr_process(aGlodaMessage, aRawReps, aIsNew,
                                        aCallbackHandle) {
    let aMsgHdr = aRawReps.header, aMimeMsg = aRawReps.mime;
    let seenBugs = {};
    if (aMimeMsg !== null) {
      let match;
      
      let bugsReferenced = [];
      
      if ((aMsgHdr.author == "bugzilla-daemon@mozilla.org") &&
          (match = this._bugSubjectRegex.exec(aMsgHdr.subject)) !== null) {
        // it _is_ a bug!
        // -- Create the bug attribute
        let bugNum = parseInt(match[1]);
        seenBugs[bugNum] = true;
        aGlodaMessage.bug = new Bug(bugNum);

        // -- Determine the actual author, if possible
        // Modified messages start with a "Jim Bob <jim@bob> changed:" line,
        //  which is the only way we can find out "Jim Bob" from the e-mail.
        //  (That is, we might be able to get it by asking the server directly.)
        // New messages do not.
        let authorString;
        // X-Bugzilla-Status: NEW
        status = aMimeMsg.headers["x-bugzilla-status"];
        authorString = aMimeMsg.headers["x-bugzilla-who"];
        if (status != "NEW") {
          let changedMatch = this._changedRegex.exec(aMimeMsg.body);
          if (changedMatch)
            authorString = changedMatch[1];
        }
        let [authorIdentities] = yield aCallbackHandle.pushAndGo(
          Gloda.getOrCreateMailIdentities(aCallbackHandle, authorString))
        if (authorIdentities.length)
          aGlodaMessage.from = authorIdentities[0];
      }
      
      while ((match = this._bugRegex.exec(aMimeMsg.body)) !== null) {
        let bugNum = parseInt(match[1]);
        if (!(bugNum in seenBugs)) {
          seenBugs[bugNum] = true;
          bugsReferenced.push(new Bug(bugNum));
        }
      }
      while ((match = this._bugLinkRegex.exec(aMimeMsg.body)) !== null) {
        let bugNum = parseInt(match[1]);
        if (!(bugNum in seenBugs)) {
          seenBugs[bugNum] = true;
          bugsReferenced.push(new Bug(bugNum));
        }
      }
    
      if (bugsReferenced.length)
        aGlodaMessage.bugsReferenced = bugsReferenced;
    }

    yield Gloda.kWorkDone;
  }
};

BugzillaAttr.init();
