import {test,expect} from "@playwright/test";

test("marketplace definitions persist and retain their Markdown",async({page})=>{
  await page.goto("/marketplace");
  await page.getByRole("button",{name:"Create agent",exact:true}).click();
  await page.getByLabel("Name",{exact:true}).fill("Ada");
  await page.getByLabel("Specialization or category").fill("Security reviewer");
  await page.getByLabel("Markdown instructions").fill("# Ada\n\nInspect authorization boundaries. <script>alert('unsafe')</script>");
  await page.getByRole("button",{name:"Evidence-led",exact:true}).click();
  await page.getByRole("button",{name:"Save definition"}).click();
  await expect(page.getByRole("heading",{name:"Ada",exact:true})).toBeVisible();
  await page.reload();
  const card=page.locator("article").filter({has:page.getByRole("heading",{name:"Ada",exact:true})});
  await card.getByRole("button",{name:"Customize agent"}).click();
  await expect(page.getByLabel("Markdown instructions")).toContainText("Inspect authorization boundaries.");
  const downloaded=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export Markdown"}).click();
  expect((await downloaded).suggestedFilename()).toBe("Ada.md");
});

test("create offline council with assigned context, answer, approve and export",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");
  await page.screenshot({path:"test-results/landing.png",fullPage:true});
  await page.getByRole("link",{name:"Explore the demo"}).click();
  await expect(page.getByRole("heading",{name:/Hello, Alex/})).toBeVisible();
  await page.screenshot({path:"test-results/dashboard.png",fullPage:true});
  await page.getByRole("button",{name:"Switch to light theme"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","light");
  await page.getByRole("button",{name:"Switch to dark theme"}).click();
  await page.getByRole("button",{name:"Assemble a council"}).click();
  await page.getByRole("button",{name:"Use example brief"}).click();
  await page.getByLabel("Council name",{exact:true}).fill("Test discovery council");
  await page.getByRole("button",{name:"Continue",exact:true}).click();
  await page.getByLabel("Upload context documents").setInputFiles({name:"requirements.md",mimeType:"text/markdown",buffer:Buffer.from("# Requirements\n\nAll humans can read this document.")});
  const row=page.locator(".mc-doc-row").filter({hasText:"requirements.md"});
  await row.locator("summary").click();
  await row.getByLabel("Everyone",{exact:true}).uncheck();
  await row.getByLabel("Maya",{exact:true}).check();
  await row.locator("summary").click();
  await page.getByRole("button",{name:"Continue",exact:true}).click();
  await page.getByRole("button",{name:"Complete demo briefing"}).click();
  await page.getByRole("button",{name:"Continue to launch"}).click();
  await page.getByRole("button",{name:/Offline session Let agents/}).click();
  await page.getByPlaceholder("Search by @username").fill("sam");
  await page.getByRole("button",{name:/Sam Chen/}).click();
  await page.getByLabel("Token budget").fill("80000");
  await page.getByRole("button",{name:"Start offline session"}).click();
  await expect(page.getByRole("heading",{name:"Test discovery council",exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByText("Offline · accepting input",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"requirements.md",exact:true}).click();
  await expect(page.getByLabel("Document preview")).toContainText("All humans can read this document.");
  await page.getByLabel("Document preview").getByRole("button",{name:"Close"}).click();
  await page.getByRole("button",{name:"Write an answer",exact:true}).click();
  await page.getByLabel("Message the council").fill("All acceptance criteria are measurable and independently reviewed.");
  await page.getByRole("button",{name:"Send",exact:true}).click();
  await page.getByRole("button",{name:"Ask Maya",exact:true}).click();
  await expect(page.getByLabel("Message the council")).toHaveValue("@Maya ");
  await page.getByLabel("Message the council").fill("@Maya Check the boundaries.");
  await page.getByRole("button",{name:"Send",exact:true}).click();
  await expect(page.getByText(/That’s a useful constraint/)).toBeVisible();
  await page.getByRole("button",{name:"Preview voice transcription"}).click();
  await expect(page.getByText(/No microphone is recording/)).toBeVisible();
  await page.getByLabel("Message the council").fill("");
  await page.getByRole("button",{name:"Move to human review"}).click();
  await page.getByRole("button",{name:"Approve this revision"}).click();
  await page.getByLabel("Review as (demo only)").selectOption("sam-chen");
  await page.getByRole("button",{name:"Approve this revision"}).click();
  await expect(page.getByText("2 of 2 approved",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Read specification"}).click();
  const downloaded=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export Markdown"}).click();
  expect((await downloaded).suggestedFilename()).toBe("specification.md");
  await page.screenshot({path:"test-results/council.png",fullPage:true});
  await page.getByRole("button",{name:"Revise answer"}).click();
  await page.getByLabel("Message the council").fill("Include accessibility criteria too.");
  await page.getByRole("button",{name:"Send",exact:true}).click();
  await expect(page.getByText("0 of 2 approved",{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile pages fit the viewport",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  for(const route of ["/","/dashboard","/marketplace","/councils/new","/councils/onboarding","/connection"]){
    await page.goto(route);
    await expect(page.locator("h1,h2").first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),route).toBe(true);
  }
  await page.screenshot({path:"test-results/mobile.png",fullPage:true});
});

test("Copilot UI requires authentication before sending chat",async({page})=>{
  const calls:string[]=[];
  await page.route("**/api/copilot/check",async route=>{calls.push(route.request().postDataJSON().action);await route.fulfill({json:{runtime:true,authenticated:false,models:[]}});});
  await page.goto("/connection");
  await expect(page.getByRole("button",{name:"Send test greeting"})).toBeDisabled();
  await page.getByRole("button",{name:"Check Copilot access"}).click();
  await expect(page.getByText("Not authenticated",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Send test greeting"})).toBeDisabled();
  expect(calls).toEqual(["status"]);
});

test("web OAuth connection uses the authenticated endpoint and exposes no token fields",async({page})=>{
  await page.route("**/api/auth/session",route=>route.fulfill({json:{mode:"github",user:{id:"42",login:"enterprise-user",name:"Corporate User"}}}));
  const bodies:unknown[]=[];
  await page.route("**/api/copilot",route=>{
    const body=route.request().postDataJSON();bodies.push(body);
    return route.fulfill({json:{runtime:true,authenticated:true,login:"enterprise-user",models:[{id:"test-model",name:"Test model"}],...(body.action==="chat"?{reply:"Marvin Council is connected."}:{})}});
  });
  await page.goto("/connection");
  await expect(page.getByText("GitHub OAuth",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Check Copilot access"}).click();
  await page.getByRole("button",{name:"Send test greeting"}).click();
  await expect(page.getByText("Marvin Council is connected.",{exact:true})).toBeVisible();
  expect(bodies).toEqual([{action:"status"},{action:"chat",model:"test-model"}]);
  await page.screenshot({path:"test-results/oauth-connection.png",fullPage:true});
});

test("runtime startup failure does not claim Copilot authentication was rejected",async({page})=>{
  await page.route("**/api/auth/session",route=>route.fulfill({json:{mode:"github",user:{id:"42",login:"test-user",name:"Test User"}}}));
  await page.route("**/api/copilot",route=>route.fulfill({json:{runtime:false,authenticated:false,authChecked:false,models:[],stage:"runtime",code:"runtime_missing",error:"The Copilot runtime is missing from this deployment."}}));
  await page.goto("/connection");
  await page.getByRole("button",{name:"Check Copilot access"}).click();
  await expect(page.getByText("Copilot authentication not checked",{exact:true})).toBeVisible();
  await expect(page.getByText("Not authenticated",{exact:true})).toHaveCount(0);
  await expect(page.getByText("Models not checked",{exact:true})).toBeVisible();
  await expect(page.getByRole("alert").filter({hasText:"runtime_missing"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Send test greeting"})).toBeDisabled();
});

test("follow-up council keeps a fixed input and links both directions after source changes",async({page})=>{
  await page.goto("/councils/research-workspace");
  await page.getByRole("button",{name:"Create follow-up council",exact:true}).click();
  await expect(page.getByLabel("Council name",{exact:true})).toHaveValue("Follow-up: A more useful research workspace");
  await expect(page.getByPlaceholder("What do we need to achieve?")).toHaveValue("");
  const linked=page.getByRole("region",{name:"Previous council outputs"});
  await expect(linked).toContainText("Not approved at capture");
  await linked.getByText("Read captured specification v3",{exact:true}).click();
  await expect(linked.locator("pre")).toContainText("Allow clients to save and resume across devices.");
  await page.getByLabel("Council name",{exact:true}).fill("Implementation planning");
  await page.getByPlaceholder("What do we need to achieve?").fill("Turn the research outcome into an implementation plan.");
  await page.getByRole("button",{name:"Continue",exact:true}).click();
  await expect(page.getByRole("button",{name:"Skip context",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Continue",exact:true}).click();
  await page.getByRole("button",{name:"Complete demo briefing"}).click();
  await page.getByRole("button",{name:"Continue to launch"}).click();
  await page.getByRole("button",{name:"Start live session"}).click();
  await expect(page.getByRole("heading",{name:"Implementation planning",exact:true})).toBeVisible();
  const followUpUrl=page.url();
  await expect(page.getByText("0 / 2 human approvals",{exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole("region",{name:"Previous council outputs"}).getByRole("link",{name:"Open source council"}).click();
  await expect(page.getByRole("region",{name:"Follow-up councils"}).getByRole("link",{name:"Implementation planning"})).toBeVisible();
  await page.getByRole("button",{name:"Revise answer"}).click();
  await page.getByLabel("Message the council").fill("The source now requires an entirely different approach.");
  await page.getByRole("button",{name:"Send",exact:true}).click();
  await page.getByRole("region",{name:"Follow-up councils"}).getByRole("link",{name:"Implementation planning"}).click();
  await expect(page).toHaveURL(followUpUrl);
  const snapshot=page.getByRole("region",{name:"Previous council outputs"});
  await expect(snapshot).toContainText("Source is now v4. This input remains v3.");
  await snapshot.getByText("Read captured specification v3",{exact:true}).click();
  await expect(snapshot.locator("pre")).toContainText("Allow clients to save and resume across devices.");
  await expect(snapshot.locator("pre")).not.toContainText("entirely different approach");
  await page.screenshot({path:"test-results/follow-up-council.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});

test("new council can select and remove previous outcomes without losing its scope",async({page})=>{
  await page.goto("/councils/new");
  await page.getByLabel("Council name",{exact:true}).fill("My next review");
  await page.getByPlaceholder("What do we need to achieve?").fill("Investigate the next step.");
  await page.getByLabel("Previous council outcome",{exact:true}).selectOption("research-workspace");
  await page.getByRole("button",{name:"Use outcome as input",exact:true}).click();
  await expect(page.getByRole("button",{name:"Outcome already attached"})).toBeDisabled();
  await expect(page.getByLabel("Council name",{exact:true})).toHaveValue("My next review");
  await page.reload();
  await expect(page.getByRole("region",{name:"Previous council outputs"})).toContainText("A more useful research workspace");
  await page.getByRole("button",{name:"Remove outcome from A more useful research workspace"}).click();
  await expect(page.getByRole("region",{name:"Previous council outputs"})).toHaveCount(0);
  await expect(page.getByPlaceholder("What do we need to achieve?")).toHaveValue("Investigate the next step.");
});
