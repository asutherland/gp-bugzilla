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

Cu.import("resource://gloda/modules/gloda.js");

Cu.import("resource://gpbugzilla/modules/noun_bug.js");


const EXT_NAME = "gp-bugzilla";

const kBugMessage_New = 1;
const kBugMessage_Changed = 2;
const kBugMessage_Request = 3;

const kPS_DoNotReply = 1;
const kPS_Who = 2;
const kPS_KeyValue = 3;
const kPS_Comment = 4;
const kPS_DiscardForever = 5;
const kPS_WhatChangedHeader = 6;
const kPS_WhatChangedTable = 7;
const kPS_RequestExplanation = 8;
const kPS_IgnoreBugInfo = 9;
const kPS_AttachmentInfo = 10;
const kPS_IgnoreAttachmentInfo = 11;

const kRequest_Asked = 1;
const kRequest_Granted = 2;
const kRequest_Denied = 3;

const REQUEST_MAP = {
  asked: kRequest_Asked,
  requested: kRequest_Asked,
  granted: kRequest_Granted,
  denied: kRequest_Denied
}

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
    let emailSnip = "([^<\\n]+<[^>\\n]+>)";
    // group 1: "BLAH asked/granted/requested:" if present
    // group 2: "BLAH" (if 1 present)
    // group 3: "asked/granted/requested" (if 1 present)
    // group 4: bug number (string, of course)
    // group 5: "New: " if present
    this._bugSubjectRegex = new RegExp("^(([^ ]+) " +
        "(requested|granted|denied): )?" +
        "\\[Bug (\\d{4,7})\\] (New: )?");
    this._changedRegex = new RegExp("^" + emailSnip + " changed:$");
    this._commentRegex = new RegExp(
      "^--- #\d+ from " + emailSnip + "  \d{4}-[^-]+ ---$");
    // group 1: requester
    // group 2: asked/granted/denied
    // group 3: requestee
    // group 4: flag name
    this._requestRegex = new RegExp("^" + emailSnip + " has " +
        "(asked|granted|denied) " + emailSnip + "(?:'s request)? " +
        "for ([^:]+):$");
    
    this._attachRegex = new RegExp("^Created an attachment \\(id=(\\d+)\\)$");
    
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
    this._attrBugAttachment = Gloda.defineAttribute({
      provider: this,
      extensionName: EXT_NAME,
      attributeType: Gloda.kAttrDerived,
      attributeName: "bugAttachment",
      singular: true,
      subjectNouns: [Gloda.NOUN_MESSAGE],
      objectNoun: Gloda.lookupNoun("bug-attachment"),
      parameterNoun: null,
      domExpose: "bug-attachment",
      });
    this._attrBugRequestAction = Gloda.defineAttribute({
      provider: this,
      extensionName: EXT_NAME,
      attributeType: Gloda.kAttrDerived,
      attributeName: "bugRequestAction",
      singular: true,
      subjectNouns: [Gloda.NOUN_MESSAGE],
      objectNoun: Gloda.lookupNoun("bug-request-action"),
      parameterNoun: null,
      domExpose: "bug-request-action",
      });

  },
  
  contentWhittle: function gp_bug_attr_contentWhittle(aGlodaMessage,
      aMeta, aBodyLines, aContent) {
    if (!aGlodaMessage.bug && !aMeta.bug) {
this._log.debug("not a bug, bailing");
      return false;
    }
    
    let subjectMatch = this._bugSubjectRegex.exec(aMeta.subject);
    if (!subjectMatch) {
this._log.debug("no subject match, bailing (subject: " + aMeta.subject + ")");
      return false;
    }
    
    // it's a bug.  we are the perfect fit.
    aContent.volunteerContent(aContent.kPriorityPerfect);
    
    let bugType;
    if (subjectMatch[1])
      bugType = kBugMessage_Request;
    else if (subjectMatch[5])
      bugType = kBugMessage_New;
    else
      bugType = kBugMessage_Changed;
    
    let iLastContentLine = aBodyLines.length - 1;
    // walk backwards until we get to "Configure bugmail:"
    while (iLastContentLine > 3 &&
           aBodyLines[iLastContentLine].indexOf("Configure bugmail:") != 0) {
      iLastContentLine--;
    }
    // decrement by 3, avoiding the configure line, the "--", and the blank.
    iLastContentLine -= 3;
    
    // == New format: tell by "New:" in the subject (type: newchanged)
    // "Do not reply" block.
    // (1 newline)
    // Indented Key: Value block.
    // (2 newlines)
    // Comment
    // (1 newline)
    // "--"
    // "Configure bugmail:"
    // "------- You are receiving this mail because: -------"
    // explanation
    if (bugType === kBugMessage_New) {
this._log.debug("NEW case");
      let state = kPS_DoNotReply;
      let eatBlank = false;
      let key = null, value = null;
      let done = false;
      for each (let [iLine, line] in Iterator(aBodyLines)) {
        if (!line && eatBlank)
          continue;
        eatBlank = false;
this._log.debug("state: " + state + " line: " + line);
        
        switch (state) {
          case kPS_DoNotReply:
            if (!line)
              state = kPS_KeyValue;
            break;
          case kPS_KeyValue:
            // values can span lines.  we can tell if there is no colon.
            if (!line) {
              state = kPS_Comment;
              eatBlank = true;
              aContent.keyValue(key, value);
            }
            line = line.trim();
            let colonIndex = line.indexOf(":");
            if (colonIndex >= 0) {
              if (key)
                aContent.keyValue(key, value);
              key = line.substring(0, colonIndex);
              value = line.substring(colonIndex+2);
            }
            else
              value += line;
            break;
          case kPS_Comment:
            aContent.content(aBodyLines.slice(iLine, iLastContentLine));
            done = true;
            break;
        }
        if (done)
          break;
      }
    }
    // Comment is after the first double-newline, although the initial block
    //  after the "Do not reply" block (newline delimited) is interesting-ish.
    // In theory, the summary is the most interesting part.
    
    // == Change format: no "New:" in the subject (type: newchanged)
    // "Do not reply" block.  Ignore.
    // (1 newline)
    // optional:
    //   (1 newline)
    //   Who changed, with id block
    //   (1 newline)
    //   Change table
    // required:
    // (4 newlines)
    // "--- Comment #18"
    // Comment
    // (1 newline)
    // "--", configure bugmail, you are receiving this mail because, etc.
    else if (bugType === kBugMessage_Changed) {
this._log.debug("CHANGED case");
      let state = kPS_DoNotReply;
      let eatBlank = false;
      let done = false;
      let key = null, oldValue = null, newValue = null;
      let tableDiv1, tableDiv2;
      for each (let [iLine, line] in Iterator(aBodyLines)) {
        if (!line && eatBlank)
          continue;
        eatBlank = false;
this._log.debug("state: " + state + " line: " + line);
        
        switch (state) {
          case kPS_DoNotReply:
            if (!line) {
              state = kPS_Who;
              eatBlank = true;
            }
            break;
          case kPS_Who:
            // Is this the "BLAH changed:" line or a "--- Comment" line?
            if (line.indexOf("--- ") != 0 ) { // "BLAH changed:"
              let changedMatch = this._changedRegex.exec(line);
              if (changedMatch)
                aMeta.author = changedMatch[1];
              state = kPS_WhatChangedHeader;
              eatBlank = true;
            }
            else {
              let commentMatch = this._commentRegex.exec(line);
              if (commentMatch)
                aMeta.author = commentMatch[1];
              state = kPS_Comment;
              eatBlank = true;
            }
            break;
          case kPS_WhatChangedHeader:
            if (line[0] == "-")
              state = kPS_WhatChangedTable;
            else {
              tableDiv1 = line.indexOf("|");
              tableDiv2 = line.indexOf("|", tableDiv1+1);
            }
            break;
          case kPS_WhatChangedTable:
            if (!line) {
              state = kPS_Who;
              eatBlank = true;
              aContent.keyValueDelta(key, oldValue, newValue);
            }
            let what = line.substring(0, tableDiv1).trim();
            let oldBit = line.substring(tableDiv1+1, tableDiv2).trim();
            let newBit = line.substring(tableDiv2+1);
            if (what) {
              if (what == "Flag" || what == "is obsolete") {
                key += " " + what;
                oldValue += oldBit;
                newValue += newBit;
              }
              else {
                aContent.keyValueDelta(key, oldValue, newValue);
                key = what;
                oldValue = oldBit;
                newValue = newBit;
              }
            }
            else {
              oldValue += oldBit;
              newValue += newBit;
            }
            break;
          case kPS_Comment:
            // see if an attachment was created...
            let attachMatch = this._attachRegex.exec(line);
            if (attachMatch) {
              aMeta.attachmentNumber = parseInt(attachMatch[1]);
              aContent.meta(line, this._attrBugAttachment);
              iLine += 2;
            }
            aContent.content(aBodyLines.slice(iLine, iLastContentLine+1));
            done = true;
            break;
        }
        if (done)
          break;
      }
    }
    // == request type: X-Bugzilla-Type: request
    // Comments after "------- Additional Comments from ", e-mail address may
    //  spill; can vaguely tell if there is no '>' on the line.
    else if (bugType == kBugMessage_Request) {
this._log.debug("REQUEST case");
      let state = kPS_RequestExplanation;
      let eatBlank = false;
      let done = false;
      let requestSoFar = "";
      for each (let [iLine, line] in Iterator(aBodyLines)) {
        if (!line && eatBlank)
          continue;
        eatBlank = false;
this._log.debug("state: " + state + " line: " + line);
        
        switch (state) {
          case kPS_RequestExplanation:
            requestSoFar += line;
            if (line[line.length-1] == ":" &&
                aBodyLines[iLine+1].indexOf("Bug ") == 0) {
              let requestMatch = this._requestRegex.exec(requestSoFar);
              if (!requestMatch)
                return false;
              aMeta.author = requestMatch[1];
              aMeta.request = REQUEST_MAP[requestMatch[2]];
              state = kPS_IgnoreBugInfo;
            }
            if (!line) {
              state = kPS_Who;
              eatBlank = true;
            }
            break;
          case kPS_IgnoreBugInfo:
            if (!line) {
              state = kPS_AttachmentInfo;
              eatBlank = true;
            }
            break;
          case kPS_AttachmentInfo:
            if (line.indexOf("Attachment ") == 0) {
              aMeta.attachmentNumber = parseInt(line.substring(11,
                line.indexOf(":")));
              state = kPS_IgnoreAttachmentInfo;
            }
            // intentional fall-through
          case kPS_IgnoreAttachmentInfo:
            if (!line)
              state = kPS_Who;
            break;
          case kPS_Who:
            // this is a '-* Additional Comments' line or its jerky spillover.
            // we already know who wrote the comment, so we ignore it.
            // we know it's the last line when it has a '>' in it for the email
            //  address.
            if (line.indexOf(">") >= 0)
              state = kPS_Comment;
            break;
          case kPS_Comment:
            aContent.content(aBodyLines.slice(iLine, iLastContentLine+1));
            done = true;
            break;
        }
        if (done)
          break;
      }
    }
    this._log.debug("CONTENT: " + aContent.getContentString());
    return true;
  },
  
  process: function gp_bug_attr_process(aGlodaMessage, aRawReps, aIsNew,
                                        aCallbackHandle) {
    let aMsgHdr = aRawReps.header, aMimeMsg = aRawReps.mime;
    let seenBugs = {};
    if (aMimeMsg !== null) {
      let match;
      
      let bugsReferenced = [];
      let meta = {subject: aMsgHdr.mime2DecodedSubject, bug: true};
      
      if ((aMsgHdr.author == "bugzilla-daemon@mozilla.org") &&
          (match = this._bugSubjectRegex.exec(aMsgHdr.subject)) !== null) {
        
        if (aRawReps.bodyLines && aRawReps.content)
          this.contentWhittle(aGlodaMessage, meta, aRawReps.bodyLines,
            aRawReps.content);
        else
          this._log.debug("No body/content, skipping content whittling.");
        
        // it _is_ a bug!
        // -- Create the bug attribute
        let bugNum = parseInt(match[4]);
        seenBugs[bugNum] = true;
        aGlodaMessage.bug = new Bug(bugNum);

        // contentWhittle tried to figure out the author with real name
        let authorString = meta.author || aMimeMsg.headers["x-bugzilla-who"];
this._log.debug("author string: " + authorString);
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
      if (meta.attachmentNumber)
        aGlodaMessage.bugAttachment = new BugAttachment(meta.attachmentNumber);
      if (meta.request)
        aGlodaMessage.bugRequestAction = meta.request;
    }

    yield Gloda.kWorkDone;
  }
};

BugzillaAttr.init();
